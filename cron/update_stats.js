'use strict';

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
    "label",
];

const epochs = {
    "alltime": "killmails",
    "recent": "killmails_90",
    "week": "killmails_7"
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
                update_stats(app, epochs[epoch], epoch, type, find);
            }
        }
        first_run = false;
    }
}

async function update_stats(app, collection, epoch, type, find) {
    try {
        if (app.bailout == true || app.no_stats == true) return;

        var iter = await app.db.statistics.find(find);
        while (await iter.hasNext()) {
            if (app.bailout == true || app.no_stats == true) break;

            var record = await iter.next();
            if (record.id !== NaN) await update_record(app, collection, epoch, record);
        }
    } catch (e) {
        console.log(e);
    } finally {
        await app.sleep(1000);
        update_stats(app, collection, epoch, type, find);
    }
}

async function update_record(app, collection, epoch, record) {
    // Are we resetting this record's epoch?
    if (record[epoch] == undefined || record[epoch].last_sequence == undefined || record[epoch].reset == true) {
        record[epoch] = {};
        //console.log('Resetting: ', epoch, record.type, record.id);
    }
    record[epoch].reset = false;

    var min = (record[epoch].last_sequence || 0);
    var max = Math.min(min + 100000000, record.sequence);

    let match = {
        stats: true,
        sequence: {
            '$lte': max,
        },
    };
    if (min > 0) match.sequence['$gt'] = min;

    await app.util.stats.update_stat_record(app, collection, epoch, record, match, max);

    // Now clear the update field only if the sequence matches
    var set = {};
    set['update_' + epoch] = false;
    await app.db.statistics.updateOne({
        _id: record._id,
        sequence: record.sequence
    }, {
        $set: set
    });
}

module.exports = f;