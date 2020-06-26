'use strict';

module.exports = getData;

async function getData(req, res) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return valid;

    const app = req.app.app;
    var killmail_id = parseInt(req.params.id);

    let killmail = await app.db.killmails.findOne({
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

    var victim_array = [];
    for (const type of Object.keys(killmail.involved)) {
        for (const id of killmail.involved[type]) {
            if (id < 0) victim_array.push(id);
        }
    }

    rawmail.constellation_id = killmail.involved.constellation_id[0];
    rawmail.region_id = killmail.involved.region_id[0];

    // We don't need to info fill attackers that are not the final blow, so clean that out
    delete rawmail.involved;

    var ret = {
        json: {
            killmail: killmail,
            rawmail: rawmail,
            victims: victim_array.join(','),
        },
        maxAge: 3600
    };

    ret.json = await app.util.info.fill(app, ret.json);
    return ret;
}