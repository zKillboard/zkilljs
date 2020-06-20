'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;

    var rawmail = await app.db.rawmails.findOne({
        killmail_id: Number.parseInt(req.params.id)
    });
    var killmail = await app.db.killmails.findOne({
        killmail_id: Number.parseInt(req.params.id)
    });

    // Ensure the attackers array exists
    if (rawmail.attackers == undefined) rawmail.attackers = [];
    // If <= 10 attackers, why are we here? 
    if (rawmail.attackers.length <= 10) {
    	return null;
    }

    // Remove the first 10 attackers
    var remaining = rawmail.attackers.splice(10, (rawmail.attackers.length - 10));

    return {
    	json: {
            killmail: killmail,
            rawmail: rawmail,
            remaining: await app.util.info.fill(app, remaining)
        },
    	maxAge: 1
    }
}