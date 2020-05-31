'use strict';

module.exports = {
    async add(app, killmail_id, hash) {
        if (typeof killmail_id != 'number') killmail_id = parseInt(killmail_id);
        if (typeof hash != 'string') throw 'hash must be a string';
        if (killmail_id <= 0) throw 'Non-numeric or 0 killmail_id given';
        let key = {
            killmail_id: killmail_id,
            hash: hash
        };
        if (await app.db.killhashes.countDocuments(key) > 0) return;
        key['status'] = 'pending';
        try {
            await app.db.killhashes.insertOne(key);
        } catch (e) {
            if (e.code != 11000) { // Ignore duplicate entry error
                console.log(e);
            }
        }
    },

    async prepKillmailRow(app, killmail_id) {
        var redisKey = 'killmail_row:' + killmail_id;
        var ret = await app.redis.get(redisKey);
        if (ret != undefined) {
            return JSON.parse(ret);
        }

        let zmail = await app.db.killmails.findOne({
            killmail_id: killmail_id
        });
        let rawmail = await app.db.rawmails.findOne({
            killmail_id: killmail_id
        });

        for (const inv of rawmail.attackers) {
            if (inv.final_blow == true) {
                rawmail.final_blow = inv;
                break;
            }
        }

        ret = {
            json: {
                zmail: zmail,
                rawmail: rawmail
            },
            maxAge: 3600
        };
        ret.json = await app.util.info.fill(app, ret.json);
        await app.redis.setex(redisKey, 3600, JSON.stringify(ret));
        return ret;
    }
}