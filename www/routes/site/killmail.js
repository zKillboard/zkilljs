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
    // Only initially show the first 10 attackers
    if (rawmail.attackers.length > 10) rawmail.attackers.length = 10;

    // Augment the rawmail
    rawmail.victim.group_id = get_negative(killmail.involved.group_id);
    rawmail.constellation_id = killmail.involved.constellation_id[0];
    rawmail.region_id = killmail.involved.region_id[0];
    if (killmail.involved.location_id != undefined) 
    	rawmail.location_id = killmail.involved.location_id[0];

    var ret = {
        json: {
            rawmail: rawmail,
            killmail: killmail
        },
        maxAge: 1
    };

    ret.json = await app.util.info.fill(app, ret.json);

    return ret;
}

function get_negative(arr) {
    for (var i of arr)
        if (i < 0) return arr;
    return null;
}