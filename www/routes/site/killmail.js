'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;

    var killmail_id = parseInt(req.params.id);
    let zmail = await req.app.app.db.killmails.findOne({
        killmail_id: killmail_id
    });
    let rawmail = await req.app.app.db.rawmails.findOne({
        killmail_id: killmail_id
    });

    for (const inv of rawmail.attackers) {
        if (inv.final_blow == true) {
            rawmail.final_blow = inv;
            break;
        }
    }

    var ret = {
        json: {
            zmail: zmail,
            rawmail: rawmail
        },
        maxAge: 3600
    };
    ret.json = await app.util.info.fill(req.app.app, ret.json);
    return ret;
}