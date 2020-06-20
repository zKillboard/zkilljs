'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;
    var killmail_id = parseInt(req.params.id);

    if (req.query.length > 0) {
        // Someone is up to something bad
        return null;
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

    var victim_array = [];
    for (const type of Object.keys(zmail.involved)) {
        for (const id of zmail.involved[type]) {
            if (id < 0) victim_array.push(id);
        }
    }

    // We don't need to info fill attackers that are not the final blow, so clean that out
    delete rawmail.involved;

    var ret = {
        json: {
            killmail: zmail,
            rawmail: rawmail,
            victims: victim_array.join(','),
        },
        maxAge: 3600
    };
    ret.json = await app.util.info.fill(app, ret.json);
    return ret;
}