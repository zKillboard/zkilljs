'use strict';

module.exports = {
   paths: '/cache/1hour/killmail/row/:id.html',
   get: get,
   ttl: 86400
}

async function get(req, res, app) {
    var now = Date.now();
    var killmail_id = parseInt(req.params.id);

    let valid = {
        required: ['v'],
        v: app.server_started
    }
    valid = req.verify_query_params(req, valid);
    if (valid !== true) {
        console.log('Redirecting to', valid);
        return {redirect: valid};
    }
    if (valid !== true) return {redirect: valid};

    let killmail = await app.db.killmails.findOne({killmail_id: killmail_id});
    let rawmail = await app.db.rawmails.findOne({killmail_id: killmail_id});

    for (const inv of rawmail.attackers) {
        if (inv.final_blow == true) {
            rawmail.final_blow = inv;
            break;
        }
    }

    var victim_array = [];
    if (killmail.involved != undefined) for (const type of Object.keys(killmail.involved)) {
        if (type == 'killmail_id' || type == 'sequence') continue;
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
    rawmail.labels = killmail.involved.label.join(' ');
    rawmail.epoch = killmail.epoch;
    rawmail.involved_cnt = killmail.involved_cnt;

    var ret = {
        package: {
            rawmail: rawmail,
            victims: victim_array.join(','),
        },
        ttl: 3600,
        view: 'killmail-row.pug'
    };

    ret.package = await app.util.info.fill(app, ret.package);
    return ret;
}