'use strict';

module.exports = {
	exec: f,
	span: 1
}

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
                await publishToKillFeed(app, killmail);
            }
        }
    } while (raw != null);
}

async function requeuePublish(app, killmail_id) {
    await app.redis.rpush('publishkillfeed', killmail_id);
}

const has_infos = {};
async function publishToKillFeed(app, killmail) {
    try {        
        var sent = [];
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
            keybase = type.replace('_id', '');
            ids = killmail.involved[type];
            for (entity_id of ids) {
                entity_id = Math.abs(entity_id);
                key = type + '_' + entity_id;
                if (has_infos[key] === true) continue;

                let info = await app.db.information.findOne({type: type, id: entity_id});
                if (info == null || info.last_updated == 0) return setTimeout(requeuePublish.bind(null, app, killmail.killmail_id), 15000);
                has_infos[key] = true;
            }
        }

        await app.phin({url: 'http://localhost:' + process.env.PORT + '/cache/1hour/killmail/row/' + killmail.killmail_id + '.html'}),
        await app.phin({url: 'http://localhost:' + process.env.PORT + '/killmail/' + killmail.killmail_id}),

        app.redis.publish('killlistfeed:all', msg);
        for (var i = 0; i < keys.length; i++) {
            type = keys[i];
            keybase = type.replace('_id', '');
            ids = killmail.involved[type];
            for (entity_id of ids) {
                entity_id = Math.abs(entity_id);
                // Make sure we have information on this entity
                await app.util.entity.wait(app, type, entity_id);

                key = '/' + keybase + '/' + entity_id;
                if (sent.indexOf(key) != -1) continue;
                await app.redis.publish('killlistfeed:' + key, msg);
                sent.push(key);
            }
        }
        killmail.involved.label.push('all');
        for (var label of killmail.labels) {
            key = '/label/' + label;
            await app.redis.publish('killlistfeed:' + key, msg);
        }
    } catch (e) {
        console.log(e);
        // ignore the error
    }
}