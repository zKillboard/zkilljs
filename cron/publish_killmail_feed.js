'use strict';

module.exports = {
	exec: f,
	span: 1
}

const wait_cache = {};
const has_infos = {};

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    let raw;
    do {
        if (app.dbstats.total > 100) return; // come back later when we're not so busy
        raw = await app.redis.blpop('publishkillfeed', 1);
        if (raw != null && raw.length > 0) {
            let killmail_id = parseInt(raw[1] || 0);

            if (killmail_id > 0) {
                const killmail = await app.db.killmails.findOne({killmail_id: killmail_id});
                if (killmail != null) {
                    await publishToKillFeed(app, killmail);
                }
            }
        }
    } while (app.bailout != true && raw != null);
}

async function requeuePublish(app, killmail_id) {
    await app.redis.rpush('publishkillfeed', killmail_id);
}

async function publishToKillFeed(app, killmail) {
    let promises = [];
    try {        
        var sent = {};
        var msg = JSON.stringify({
            'action': 'killlistfeed',
            'killmail_id': killmail.killmail_id
        });
        var keys = Object.keys(killmail.involved);
        var keybase, type, ids, entity_id, key;

        // Iterate each type and id first to make sure we have all information needed
        // before sending it off to the masses
        for (var i = 0; i < keys.length; i++) {
            type = keys[i];
            if (type == 'label') continue;
            keybase = type.replace('_id', '');
            ids = killmail.involved[type];
            for (entity_id of ids) {
                entity_id = Math.abs(entity_id);
                key = type + '_' + entity_id;
                if (has_infos[key] === true) continue;

                let info = await app.db.information.findOne({type: type, id: entity_id});
                if (info == null || info.last_updated == 0) {
                    return setTimeout(requeuePublish.bind(null, app, killmail.killmail_id), 15000);
                }
                has_infos[key] = true;
            }
        }

        let www_server_started = await  app.redis.get('zkilljs:www:server_started');
        if (www_server_started != null) {
            promises.push(app.phin({url: 'http://localhost:' + process.env.PORT + '/cache/1hour/killmail/row/' + killmail.killmail_id + '.html?v=' + www_server_started}));
            promises.push(app.phin({url: 'http://localhost:' + process.env.PORT + '/kill/' + killmail.killmail_id}));
        }
        await app.waitfor(promises);
        promises.length = 0;

        promises.push(app.redis.publish('killlistfeed:all', msg));
        killmail.involved.label.push('all');
        for (var i = 0; i < keys.length; i++) {
            type = keys[i];
            keybase = type.replace('_id', '');
            ids = killmail.involved[type];
            for (entity_id of ids) {
                entity_id = (type == 'label' ? entity_id : Math.abs(entity_id));
                key = '/' + keybase + '/' + entity_id;

                // Make sure we have information on this entity
                if (type != 'label' && wait_cache[key] == undefined) {
                    await app.util.entity.wait(app, type, entity_id);
                    wait_cache[key] = true;
                }

                if (sent[key] != undefined) continue;
                promises.push(app.redis.publish('killlistfeed:' + key, msg));
                sent[key] = true;
            }
        }
        await app.waitfor(promises);
    } catch (e) {
        console.log(e);
        // ignore the error
    }
}