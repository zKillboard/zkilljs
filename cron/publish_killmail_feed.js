'use strict';

module.exports = {
	exec: f,
	span: 1
}

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    let raw = await app.redis.blpop('publishkillfeed', 1);
    if (raw != null && raw.length > 0) {
        let killmail_id = parseInt(raw[1] || 0);

        if (killmail_id > 0) {
            const killmail = await app.db.killmails.findOne({killmail_id: killmail_id});
            await publishToKillFeed(app, killmail);
        }
    }
}

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
                let info = await app.db.information.findOne({type: type, id: entity_id});
                if (info == null || info.last_updated == 0) {
                    await app.redis.push('publishkillfeed', killmail.killmail_id);
                    return;
                }
            }
        }

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
        killmail.labels.push('all');
        for (var label of killmail.labels) {
            key = '/label/' + label;
            await app.redis.publish('killlistfeed:' + key, msg);
        }
    } catch (e) {
        // ignore the error
    }
}