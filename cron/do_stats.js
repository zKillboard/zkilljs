'use strict';

const prepSet = new Set();
var firstRun = true;

async function f(app) {
    if (firstRun) {
        firstRun = false;
        populateSet(app);
    }

    await app.sleep(1000);
    while (app.no_stats && prepSet.size > 0) await app.sleep(1000);
}

async function populateSet(app) {
    let prepped = 0;
    try {
        let killhashes = await app.db.killhashes.find({
            status: 'parsed'
        });

        while (await killhashes.hasNext()) {
            if (app.no_stats) break;

            prepStats(app, await killhashes.next());
            while (prepSet.size >= 10) await app.sleep(1);
            prepped++;
            app.zincr('stats_prepped');
        }
        while (prepSet.size > 0) {
            await app.sleep(1);
        }

        if (prepped < 100) await update_stats(app);
    } catch (e) {
        console.log(e);
    } finally {
        await app.sleep(1000);
        populateSet(app);
    }
}

async function prepStats(app, killhash) {
    try {
        prepSet.add(killhash);

        let killmail = await app.db.killmails.findOne({
            killmail_id: killhash.killmail_id
        });

        let promises = [];
        let keys = Object.keys(killmail.involved);
        for (let i = 0; i < keys.length; i++) {
            let type = keys[i];
            let values = killmail.involved[type];
            for (let j = 0; j < values.length; j++) {
                let id = values[j];
                promises.push(addKM(app, killmail, type, id, "alltime"));
            }
            for (let j = 0; j < killmail.labels.length; j++) {
                promises.push(addKM(app, killmail, 'label', killmail.labels[j], "alltime"));
            }
        }
        await Promise.all(promises); // If one errors they all error!

        await app.db.killhashes.updateOne({
            _id: killhash._id
        }, {
            $set: {
                status: 'done'
            }
        });
    } catch (e) {
        console.log(e);
    } finally {
        prepSet.delete(killhash);
    }
}

const addSet = new Set(); // cache for keeping track of what has been inserted to stats collection
setInterval(function () {
    addSet.clear();
}, 3600000);

async function addKM(app, killmail, type, id, span) {
    if (typeof id != 'string') id = Math.abs(id);
    let addKey = type + ':' + id;
    try {
        if (!addSet.has(addKey)) {
            await app.db.statistics.insertOne({
                type: type,
                id: id,
                span: 'alltime'
            });
            addSet.add(addKey);
        }
    } catch (e) {
        if (e.code != 11000) { // ignore duplicate key error
            addSet.add(addKey);
            console.log(e);
        }
    }

    await app.db.statistics.updateOne({
        type: type,
        id: id,
        span: 'alltime',
        sequence: {
            $lt: killmail.sequence
        }
    }, {
        $set: {
            update: true,
            sequence: killmail.sequence
        },
    });
}

const nextAgg = {
    'alltime': 'year',
    'year': 'month',
    'month': 'day'
};

let updateSet = new Set();

async function update_stats(app) {

    let records = await app.db.statistics.find({
        update: true
    });

    let calced = 0;
    while (await records.hasNext()) {
        if (app.no_stats) break;

        let record = await records.next();
        let match = {
            sequence: {
                '$gt': (record.last_sequence || 0),
                '$lte': record.sequence
            },
            stats: true,
        };
        update_stat_record(app, record, match);

        while (updateSet.size >= 10) await app.sleep(1);
        calced++;
        app.zincr('stats_updated');
    }
    while (updateSet.size > 0) {
        await app.sleep(1);
    }
}

async function update_stat_record(app, record, match) {
    try {
        updateSet.add(record);
        await app.util.stats.update_stat_record(app, record, match);
    } catch (e) {
        console.log(e);
    } finally {
        updateSet.delete(record);
    }
}



module.exports = f;