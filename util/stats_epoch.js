'use strict';

const updateSet = new Set();

const types = [
    "character_id",
    "corporation_id",
    "alliance_id",
    "faction_id",
    "item_id",
    "group_id",
    "location_id",
    "solar_system_id",
    "constellation_id",
    "region_id",
    "war_id",
];

var epoch_types_started = {};

const stats_epoch = {
    calc_epoch_range: async function (app, collection, activity_collection, epoch_type, epoch_start) {
        var redisKey = 'zkilljs:epoch:' + epoch_type + ':sequence';

        // start the type jobs
        if (epoch_types_started[epoch_type] != true) {
            epoch_types_started[epoch_type] = true;
            for (const type of types) {
                this.update_by_type(app, collection, epoch_type, type);
            }
        }

        var iter = await app.db[collection].find({
            epoch: {
                '$lt': epoch_start
            }
        });
        await this.process_rows(app, collection, iter, epoch_type, true);
    },

    update_by_type: async function (app, collection, epoch_type, type) {
        try {
            var find = {
                type: type
            };
            var set = {};
            find['update_' + epoch_type] = true;
            set['update_' + epoch_type] = false;

            var iter = await app.db.statistics.find(find);
            while (await iter.hasNext()) {
                if (app.bailout) return;

                var record = await iter.next();
                record[epoch_type] = {};

                var match = {
                    stats: true
                };
                await this.update_stat_record(app, collection, record, match, epoch_type);
                await app.db.statistics.updateOne({
                    _id: record._id
                }, {
                    '$set': set
                });
                await app.util.stats.publishStatsUpdate(app, record);
            }
        } catch (e) {
            console.log(e);
        } finally {
            await app.sleep(1000);
            this.update_by_type(app, collection, epoch_type, type);
        }
    },

    process_rows: async function (app, collection, iter, epoch_type, deleteRow) {
        var high_sequence = 0;
        while (await iter.hasNext()) {
            if (app.bailout) return;

            const killmail = await iter.next();
            high_sequence = Math.max(high_sequence, killmail.sequence);
            if (deleteRow) {
                await app.db[collection].deleteOne({
                    _id: killmail._id
                });
            }
            this.add_entities(app, killmail, epoch_type);
        }
        return high_sequence;
    },

    add_entities: async function (app, killmail, epoch_type) {
        var entities = {};
        for (const type of Object.keys(killmail.involved)) {
            var ids = killmail.involved[type];
            for (var id of ids) {
                id = Math.abs(id);
                var key = type + '-' + id;
                if (entities[type] == undefined) {
                    var set = {};
                    set['update_' + epoch_type] = true;
                    await app.db.statistics.updateOne({
                        type: type,
                        id: id
                    }, {
                        $set: set
                    });
                    entities[key] = {
                        type: type,
                        id: id
                    }
                    //console.log('adding ', epoch_type, type, id);
                }
            }
        }
    },

    update_stat_record: async function update_stat_record(app, collection, record, match, epoch_type) {
        const s = Symbol();
        try {
            updateSet.add(s);
            //console.log('calcing ', epoch_type, record.type, record.id);
            await app.util.stats.update_stat_record(app, collection, epoch_type, record, match, -1);
        } catch (e) {
            console.log(e);
        } finally {
            updateSet.delete(s);
        }
    }
};

module.exports = stats_epoch;