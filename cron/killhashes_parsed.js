'use strict';

module.exports = {
    exec: f,
    span: 1
}

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    if (app.dbstats.fetched > 100) return;

    await app.util.simul.go(app, 'killhashes_parsed', app.db.killhashes, { find: {status: 'parsed'}, sort: {sequence: -1}}, prepStats, app.util.assist.continue_simul_go, 5); 
}

let sequences = {};
let added = {};
let handling = {};
function clear_caches() {
    sequences = {};
    added = {};
}
setInterval(clear_caches, 3600000);

async function prepStats(app, killhash) {
    //let promises = [];
    try {
        let killmail = await app.db.killmails.findOne({killmail_id: killhash.killmail_id});
        if (killmail.involved == undefined) {
            console.log(killhash.killmail_id + ' has no involved');
            return await app.db.killhashes.updateOne({_id: killhash._id}, {$set: {status: 'stats_prepare_error', reason: 'no involved'}});
        }

        killmail.involved.label.push('all');
 
        for (let type of Object.keys(killmail.involved)) {
            for (let id of killmail.involved[type]) {
                if (type != 'label') id = Math.abs(id);
                let skey = type + '-' + id;

                let sequence = sequences[skey] | 0;
                if (sequence == 0 || killmail.sequence > sequence) add_killmail(app, killmail, type, id, skey); // purposely not await'ing

                sequences[skey] = Math.max((sequences[skey] | 0), killmail.sequence);
            }
        }

        //if (promises.length > 0) await Promise.all(promises);

        await app.db.killhashes.updateOne({_id: killhash._id}, {$set: {status: 'done'}});
        app.util.ztop.zincr(app, 'killmail_process_stats');
    } catch (e) {
        console.log(killhash, e);
        await app.db.killhashes.updateOne({_id: killhash._id}, {$set: {status: 'stat-error'}});
    }
}

async function add_killmail(app, killmail, type, id, skey) {
    while (handling[skey] == true) await app.sleep(1);
    try {
        handling[skey] = true;
        if (id == undefined || id == null) throw 'id must be defined';

        let record = await app.db.statistics.findOne({type: type, id: id});
        if (record == null) {
            try {
                if (added[skey] == undefined) {
                    await app.db.statistics.insertOne({
                        type: type,
                        id: id,
                        update_alltime: true,
                        update_recent: true,
                        update_week: true,
                        sequence: killmail.sequence
                    });
                    added[skey] = true;
                    return;
                }
            } catch (e) {
                if (e.code == 11000) { // ignore duplicate key error
                    added[skey] = true; // something else beat us to it
                } else {
                    console.log(e);
                }
            }
        }

        if (record.sequence > killmail.sequence) {
            sequences[skey] = Math.max(record.sequence, killmail.sequence, sequences[skey] | 0);
            return; // don't bother
        }

        const now = Math.floor(Date.now() / 1000);
        let update_recent = (killmail.epoch > (now - (90 * 86400)));
        let update_week =  (killmail.epoch > (now - (7 * 86400)));

        let set = {
                    update_alltime: true,
                    update_recent: update_recent,
                    update_week: update_week,
                    sequence: killmail.sequence
        };

        await app.db.statistics.updateOne({type: type, id: id, sequence: { $lt: killmail.sequence } }, { $set: set, });
    } finally {
        delete handling[skey];                    
    }
}