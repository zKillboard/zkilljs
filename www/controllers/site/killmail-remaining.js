'use strict';

module.exports = {
   paths: '/cache/1hour/killmail/:id/remaining.html',
   get: get,
   ttl: 86400
}

async function get(req, res) {
    const app = req.app.app;

    var rawmail = await app.db.rawmails.findOne({
        killmail_id: Number.parseInt(req.params.id)
    });
    var killmail = await app.db.killmails.findOne({
        killmail_id: Number.parseInt(req.params.id)
    });

    // Ensure the attackers array exists
    if (rawmail.attackers == undefined) rawmail.attackers = [];

    // Remove the first 10 attackers
    var remaining = (rawmail.attackers.length <= 10 ? [] : rawmail.attackers.splice(10, (rawmail.attackers.length - 10)));

    return {
    	package: {
            killmail: killmail,
            rawmail: rawmail,
            remaining: await app.util.info.fill(app, remaining)
        },
    	ttl: 1,
        view: 'killmail-remaining.pug'
    }
}