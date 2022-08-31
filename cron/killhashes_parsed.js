'use strict';

module.exports = {
    exec: f,
    span: 1
}

const max_concurrent = (process.env.max_concurrent_parsed | 25);

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    //if (app.dbstats.fetched > 100) return;

    await app.util.simul.go(app, 'killhashes_parsed', app.db.killhashes, { find: {status: 'parsed'}, sort: {sequence: -1}}, prepStats, app.util.assist.continue_simul_go, max); 
}

async function max(app) {
    if (app.dbstats.fetched > 100) return 1;
    return max_concurrent;
}

let sequences = {};
let added = {};
let handling = {};
function clear_caches() {
    sequences = {};
    added = {};
    handling = {};
}
setInterval(clear_caches, 300000);

async function prepStats(app, killhash) {
    try {
        let killmail = await app.db.killmails.findOne({killmail_id: killhash.killmail_id});
        if (killmail.involved == undefined) {
            console.log(killhash.killmail_id + ' has no involved');
            return await app.db.killhashes.updateOne({_id: killhash._id}, {$set: {status: 'stats_prepare_error', reason: 'no involved'}});
        }

        killmail.involved.label.push('all');
 
        let keys = Object.keys(killmail.involved);
        for (let i = 0; i < keys.length; i++) {
            let type = keys[i];
            let values = killmail.involved[type];
            for (let j = 0; j < values.length; j++) {
                let id = (type == 'label' ? values[j] : Math.abs(values[j]));
                let skey = type + '-' + id;

                while (handling[skey] == true) await app.sleep(1);
                handling[skey] = true;

                let sequence = sequences[skey] | 0;
                if (sequence == 0 || killmail.sequence > sequence) await add_killmail(app, killmail, type, id);

                sequences[skey] = Math.max((sequences[skey] | 0), killmail.sequence);
                handling[skey] = false;
            }
        }

        await app.db.killhashes.updateOne({_id: killhash._id}, {$set: {status: 'done'}});
        app.util.ztop.zincr(app, 'killmail_process_stats');
    } catch (e) {
        console.log(killhash, e);
        await app.db.killhashes.updateOne({_id: killhash._id}, {$set: {status: 'stat-error'}});
    }
}

async function add_killmail(app, killmail, type, id) {
    if (id == undefined || id == null) throw 'id must be defined';

    let addKey = type + '-' + id;

    try {
        if (added[addKey] == undefined) {
            await app.db.statistics.insertOne({
                type: type,
                id: id,
                update_alltime: true,
                update_recent: true,
                update_week: true,
                sequence: killmail.sequence
            });
            added[addKey] = true;
            return;
        }
    } catch (e) {
        if (e.code == 11000) { // ignore duplicate key error
            added[addKey] = true; // something else beat us to it
        } else {
            console.log(e);
        }
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
}