'use strict';

module.exports = {
    exec: f,
    span: 15
}

const types = {
    "character_id": 50,
    "corporation_id": 20,
    "alliance_id": 10,
    "faction_id": 1,
    "item_id": 1,
    "group_id": 1,
    "category_id": 1,
    "location_id": 25,
    "solar_system_id": 5,
    "constellation_id": 3,
    "region_id": 1,
    "war_id": 5,
    "label": 1,
};

const epochs = {
    "week": "killmails_7",
    "recent": "killmails_90",
    "alltime": "killmails",
};
const epoch_keys = Object.keys(epochs);

let concurrent = 0;
let first_run = true;

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    await app.db.statistics.updateMany({reset: true}, {$set: {'update_alltime': true, update_recent: true, update_week: true, 'week.reset': true, 'recent.reset': true, 'alltime.reset': true}, $unset: {reset: 1}}, {multi: true});

    if (first_run) {
        for (const type of Object.keys(types)) {
            for (const epoch of epoch_keys) {
                let find = {
                    type: type
                };
                find['update_' + epoch] = true;
                update_stats(app, epochs[epoch], epoch, type, find);
            }
        }
        first_run = false;
    }
}

function max(app, epoch, type) {
    if (app.dbstats.parsed >= 100) return 0;

    if (epoch == 'alltime' && app.dbstats.update_recent >= 100) return 0;
    if (epoch == 'recent' && app.dbstats.update_week >= 100) return 0;

    return types[type];
}

async function update_stats(app, collection, epoch, type, find) {
    let promises = [];
    try {
        let iter = await app.db.statistics.find(find).project({_id: 1}).limit(1000).batchSize(100);
        while (app.bailout != true && await iter.hasNext()) {
            while (app.bailout != true && concurrent >= max(app, epoch, type)) await app.sleep(10);
            
            let record_id = await iter.next();
            concurrent++;

            // statistics records can be large, by only pulling it in when we're going to
            // work on it, we conserve memory usage this way.
            let record = await app.db.statistics.findOne({_id: record_id._id});
            promises.push(update_record(app, collection, epoch, record));
        }
        await iter.close();
    } catch (e) {
        console.log(e);
    } finally {
        await app.waitfor(promises);
        setTimeout(update_stats.bind(null, app, collection, epoch, type, find), (promises.length == 0 ? 15000 : 1));
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
        } else {
            match['involved.' + record.type] = record.id;
            if (record.type != 'label') match['involved.label'] = 'pvp';
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
        let modified = await app.db.statistics.updateOne({_id: record._id, sequence: record.sequence}, {$set: set});

        // announce that the stats have been updated
        await app.redis.sadd('zkilljs:stats:publish', redis_base);
        await app.redis.sadd('zkilljs:toplists:publish', redis_base);
        app.util.ztop.zincr(app, 'stats_calced_' + epoch);
    } finally {
        record = null; // memory leak prevention
        result = null; // memory leak prevention
        set = null;
        concurrent--;
    }
}