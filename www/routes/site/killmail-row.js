'use strict';

module.exports = getData;

async function getData(req, res) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return valid;

    var now = Date.now();
    const app = req.app.app;
    var killmail_id = parseInt(req.params.id);

    let killmail = await app.db.killmails.findOne({killmail_id: killmail_id});
    let rawmail = await app.db.rawmails.findOne({killmail_id: killmail_id});

    for (const inv of rawmail.attackers) {
        if (inv.final_blow == true) {
            rawmail.final_blow = inv;
            break;
        }
    }

    var victim_array = [];
    for (const type of Object.keys(killmail.involved)) {
        var lowid = killmail.involved[type].length == 1 ? killmail.involved[type][0] : Math.min(... killmail.involved[type]);
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
    rawmail.labels = killmail.labels.join(' ');
    rawmail.epoch = killmail.epoch;
    rawmail.involved_cnt = killmail.involved_cnt;

    var ret = {
        json: {
            rawmail: rawmail,
            victims: victim_array.join(','),
        },
        maxAge: 0
    };

    ret.json = await app.util.info.fill(app, ret.json);

    // ret.json.rawmail.calculated_security_status = get_ccp_security_level(ret.json.rawmail.solar_system_security_status)

    // console.log(ret.json.rawmail.solar_system_security_status, ret.json.rawmail.solar_system_security_rounded);
    return ret;
}

function get_ccp_security_level(security_status) {
    return security_status;

    var ret = security_status.number_format(0, 1);
    if (ret == 0 && security_status > 0) {
        ret = 0.1;
    }
    return ret;
}