'use strict';

module.exports = {
    exec: f,
    span: 1
}

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    await app.util.simul.go(app, 'killhashes_parsed', app.db.killhashes, {status: 'parsed'}, prepStats, app.util.assist.continue_simul_go, 100); 
}

async function prepStats(app, killhash) {
    try {
        let killmail = await app.db.killmails.findOne({killmail_id: killhash.killmail_id});
        if (killmail.involved == undefined) {
            console.log(killhash.killmail_id + ' has no involved');
            return await app.db.killhashes.updateOne({_id: killhash._id}, {$set: {status: 'stats_prepare_error', reason: 'no involved'}});
        }

        killmail.labels.push('all');

        let keys = Object.keys(killmail.involved);
        for (let i = 0; i < keys.length; i++) {
            let type = keys[i];
            let values = killmail.involved[type];
            for (let j = 0; j < values.length; j++) {
                let id = Math.abs(values[j]);
                if (!isNaN(id) && id > 0) await add_killmail(app, killmail, type, Math.abs(id));
            }
        }
        for (let j = 0; j < killmail.labels.length; j++) {
            await add_killmail(app, killmail, 'label', killmail.labels[j]);
        }

        await app.db.killhashes.updateOne({_id: killhash._id}, {$set: {status: 'done'} });
        app.util.ztop.zincr(app, 'killmail_process_stats');
    } catch (e) {
        console.log(e);
    }
}

const addSet = new Set(); // cache for keeping track of what has been inserted to stats collection
let sequenceUpdates = new Map();
setInterval(function () {
    addSet.clear();
    sequenceUpdates.clear();
}, 900000);

async function add_killmail(app, killmail, type, id) {
    if (id == undefined || id == null) return;

    let addKey = type + ':' + id;
    let previousSequence = sequenceUpdates.get(addKey);
    if (previousSequence != undefined && previousSequence > killmail.sequence) return; // no need to do any of this

    try {
        if (!addSet.has(addKey)) {
            await app.db.statistics.insertOne({
                type: type,
                id: id,
                update_alltime: true,
                update_recent: true,
                update_week: true,
                sequence: killmail.sequence
            });
            addSet.add(addKey);
            if (previousSequence == undefined || previousSequence < killmail.sequence) sequenceUpdates.set(addKey, killmail.sequence);
            return;
        }
    } catch (e) {
        if (e.code == 11000) { // ignore duplicate key error
            addSet.add(addKey);
        } else {
            console.log(e);
        }
    }

    const now = Math.floor(Date.now() / 1000);
    var update_recent = (killmail.epoch > (now - (90 * 86400)));
    var update_week =  (killmail.epoch > (now - (7 * 86400)));

    var set = {
                update_alltime: true,
                update_recent: update_recent,
                update_week: update_week,
                sequence: killmail.sequence
        };
    if (update_recent) set.update_recent = true;
    if (update_week) set.update_week = true;

    await app.db.statistics.updateOne({type: type, id: id, sequence: { $lt: killmail.sequence } }, { $set: set, });
    sequenceUpdates.set(addKey, killmail.sequence);
}