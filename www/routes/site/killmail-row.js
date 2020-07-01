'use strict';

module.exports = getData;

async function getData(req, res) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return valid;

    var now = Date.now();
    const app = req.app.app;
    var killmail_id = parseInt(req.params.id);

    let killmail = app.db.killmails.findOne({
        killmail_id: killmail_id
    });
    let rawmail = app.db.rawmails.findOne({
        killmail_id: killmail_id
    });
    killmail = await killmail;
    rawmail = await rawmail;

    for (const inv of rawmail.attackers) {
        if (inv.final_blow == true) {
            rawmail.final_blow = inv;
            break;
        }
    }

    var victim_array = [];
    for (const type of Object.keys(killmail.involved)) {
        var lowid = killmail.involved[type].length > 1 ? killmail.involved[type][0] : Math.min(... killmail.involved[type]);
        if (lowid < 0) {
            victim_array.push(lowid);
        }
    }

    rawmail.constellation_id = killmail.involved.constellation_id[0];
    rawmail.region_id = killmail.involved.region_id[0];

    // We don't need to info fill attackers that are not the final blow, so clean that out
    delete rawmail.involved;
    delete rawmail.attackers;
    delete rawmail.victim.items;

    rawmail.stats = killmail.stats;
    rawmail.total_value = killmail.total_value;
    rawmail.labels = killmail.labels;
    rawmail.involved_cnt = killmail.involved_cnt;

    var ret = {
        json: {
            rawmail: rawmail,
            victims: victim_array.join(','),
        },
        maxAge: 1
    };

    ret.json = await app.util.info.fill(app, ret.json);
    return ret;
}
