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
        }).sort({
            _id: -1
        });

        while (await killhashes.hasNext()) {
            if (app.no_stats) break;

            prepStats(app, await killhashes.next());
            while (prepSet.size >= 10) await app.sleep(1);
            prepped++;
            app.zincr('stats_prepped');
        }
        while (prepSet.size > 100) {
            await app.sleep(1);
        }

        await update_stats(app);
    } catch (e) {
        console.log(e);
    } finally {
        if (prepped == 0) await app.sleep(1000);
        populateSet(app);
    }
}

async function prepStats(app, killhash) {
    try {
        prepSet.add(killhash);

        let killmail = await app.db.killmails.findOne({
            killmail_id: killhash.killmail_id
        });
        if (killmail == undefined) {
            await app.db.killhashes.updateOne({
                _id: killhash._id
            }, {
                $set: {
                    status: 'fetch'
                }
            });
            return;
        }

        let promises = [];
        if (killmail.involved == undefined) {
            console.log(killhash.killmail_id + ' has no involved');
            return;
        }
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
let sequenceUpdates = new Map();
setInterval(function () {
    addSet.clear();
    sequenceUpdates.clear();
}, 3600000);

async function addKM(app, killmail, type, id, span) {
    if (typeof id != 'string') id = Math.abs(id);
    let addKey = type + ':' + id;
    try {
        if (!addSet.has(addKey)) {
            await app.db.statistics.insertOne({
                type: type,
                id: id,
                span: 'alltime',
                update: true,
                sequence: killmail.sequence
            });
            addSet.add(addKey);
            return;
        }
    } catch (e) {
        if (e.code == 11000) { // ignore duplicate key error
            addSet.add(addKey);
        } else {
            console.log(e);
        }
    }

    let previousSequence = sequenceUpdates.get(addKey);
    if (previousSequence == undefined || killmail.sequence > previousSequence) {
  
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
        sequenceUpdates.set(addKey, killmail.sequence);
    }
}

const nextAgg = {
    'alltime': 'year',
    'year': 'month',
    'month': 'day'
};

let updateSet = new Set();

async function update_stats(app) {
    let calced;
    do {
        let promises = [];
        calced = 0;
        if (app.no_stats) break;
        let records = await app.db.statistics.find({
            update: true
        });

        let min, max;
        while (await records.hasNext()) {
            if (app.no_stats) break;
            let record = await records.next();

            if (record.reset == true) {
                let keep = ['_id', 'type', 'id', 'span', 'sequence', 'update'];
                let remove = {};
                let keys = Object.keys(record);
                for (let key of keys) {
                    if (keep.indexOf(key) < 0) {
                        remove[key] = 1;
                        delete record[key];
                    }
                }
                await app.db.statistics.updateOne(record, {
                    $unset: remove
                });
            }

            min = (record.last_sequence || 0);
            max = Math.min(min + 100000000, record.sequence);

            let match = {
                stats: true,
                sequence: {
                    '$gt': min,
                    '$lte': max,
                },
            };

            while (updateSet.size >= 10) await app.sleep(1);
            promises.push(update_stat_record(app, record, match, max));
            await app.sleep(1);

            calced++;
            app.zincr('stats_updated');
        }
        while (updateSet.size > 0) {
            await app.sleep(1);
        }
        await app.waitfor(promises);
    } while (calced > 0);

    while (updateSet.size > 0) {
        await app.sleep(1);
    }
}

async function update_stat_record(app, record, match, max) {
    const s = Symbol();
    try {
        updateSet.add(s);
        await app.util.stats.update_stat_record(app, record, match, max);
    } catch (e) {
        console.log(e);
    } finally {
        updateSet.delete(s);
    }
}



module.exports = f;
