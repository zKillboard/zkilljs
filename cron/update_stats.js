'use strict';

const types = [
    "character_id",
    "corporation_id",
    "alliance_id",
    "faction_id",
    "item_id",
    "group_id",
    "category_id",
    "location_id",
    "solar_system_id",
    "constellation_id",
    "region_id",
    "war_id",
    "label",
];

const epochs = {
    "week": "killmails_7",
    "recent": "killmails_90",
    "alltime": "killmails",
};
const epoch_keys = Object.keys(epochs);

var first_run = true;

async function f(app) {
    if (first_run) {
        for (const type of types) {
            for (const epoch of epoch_keys) {
                var find = {
                    type: type
                };
                find['update_' + epoch] = true;
                await update_stats(app, epochs[epoch], epoch, type, find);
            }
        }
        first_run = false;
    }
}

async function update_stats(app, collection, epoch, type, find) {
    var iterated = false;

    try {
        if (app.bailout == true || app.no_stats == true) return;
        if (app.delay_stat) return await app.randomSleep(1000, 3000);

        var iter = await app.db.statistics.find(find).limit(10000);
        while (await iter.hasNext()) {
            if (app.bailout == true || app.no_stats == true) break;
            if (app.delay_stat) return await app.randomSleep(1000, 3000);

            var record = await iter.next();

            if (record.id !== NaN) {
                await update_record(app, collection, epoch, record);
                iterated = true;
                app.zincr('stats_calced_' + epoch);
            }
        }
    } catch (e) {
        console.log(e);
    } finally {
        setTimeout(function () {
            update_stats(app, collection, epoch, type, find);
        }, (iterated ? 1 : 15000));
    }
}

async function update_record(app, collection, epoch, record) {
    var result = null; 
    var set = null;

    try {
        // Are we resetting this record's epoch?
        var killed_top = undefined,
            lost_top = undefined,
            hash_killed_top = undefined;
        if (record[epoch] == undefined || record[epoch].last_sequence == undefined || record[epoch].reset == true) {
            if (record[epoch]) {
                killed_top = record[epoch].killed_top;
                lost_top = record[epoch].lost_top;
                hash_killed_top = record[epoch].hash_killed_top;
            }
            record[epoch] = {};
        }
        record[epoch].reset = false;

        let redis_base = JSON.stringify({
            type: record.type,
            id: record.id
        });

        var min = (record[epoch].last_sequence || 0);
        let increment = (epoch == 'week' ? 100000000 : 1000000);
        var max = record.sequence;

        let match = {
            sequence: {
                '$lte': max,
            },
        };
        if (min > 0) match.sequence['$gt'] = min;

        if (record.type == 'label' && record.id == 'all') {
            // no match, we want all of the killmails
        } else if (record.type == 'label') {
            match['labels'] = record.id;
        } else {
            match['involved.' + record.type] = record.id;
            match.labels = 'pvp';
        }

        // Update the stats based on the result, but don't clear the update_ field yet
        set = {};
        result = await app.util.stats.update_stat_record(app, collection, epoch, record, match, max);
        const redisRankKey = 'zkilljs:ranks:' + record.type + ':' + epoch;
        if (result == null) {
            await app.db.statistics.updateOne({
                _id: record._id,
            }, {
                $unset: {
                    [epoch]: 1
                }
            });
 
            // Update the redis ranking
            await app.redis.zrem(redisRankKey, record.id);
        } else {
            result.update_top = true;
            set[epoch] = result;
            if (killed_top) set[epoch].killed_top = killed_top;
            if (lost_top) set[epoch].lost_top = lost_top;
            if (hash_killed_top) set[epoch].hash_killed_top = hash_killed_top;

            await app.db.statistics.updateOne({
                _id: record._id,
            }, {
                $set: set
            });

            // Update the redis ranking
            var killed = result.killed || 0;
            var score = result.score || 0;
            if (killed > 0) await app.redis.zadd(redisRankKey, Math.floor(killed * score), record.id);
            else await app.redis.zrem(redisRankKey, record.id);
        }

        // Now clear the update field only if the sequence matches
        set = {};
        set['update_' + epoch] = false;
        await app.db.statistics.updateOne({
            _id: record._id,
            sequence: record.sequence
        }, {
            $set: set
        });

        // announce that the stats have been updated
        await app.redis.sadd('zkilljs:stats:publish', redis_base);

    } finally {
        record = null; // memory leak prevention
        result = null; // memory leak prevention
        set = null;
    }
}

module.exports = f;
