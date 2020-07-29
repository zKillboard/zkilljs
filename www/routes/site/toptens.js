'use strict';

var types = [
    'character_id',
    'corporation_id',
    'alliance_id',
    'faction_id',
    'item_id',
    'region_id',
    'solar_system_id',
    'location_id',
];

async function f(req, res) {
    const app = req.app.app;

    let query = {
        type: (req.params.type == 'label' ? 'label' : req.params.type + '_id'),
        id: (req.params.type == 'label' ? req.params.id : Math.abs(parseInt(req.params.id)))
    };

    var record = await app.db.statistics.findOne(query);
    if (record.week == undefined) record.week = {};
    if (record.week.hash_killed_top == undefined) record.week.hash_killed_top = 'none';

    if (req.query.current_hash == record.week.hash_killed_top) return 204;
    var valid = {
        required: ['hash'],
        hash: record.week.hash_killed_top
    }
    req.alternativeUrl = '/cache/1hour/toptens/' + req.params.type + '/' + req.params.id + '.html';
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) return valid;

    if (record.week.killed_top == undefined) return {
        json: {}
    }; // empty, do nothing

    var ret = await app.util.info.fill(app, record.week.killed_top);
    var topisk = [];
    if (ret.topisk != undefined) {
        for (var i = 0; i < ret.topisk.length; i++) {
            var row = ret.topisk[i];
            var killmail = await app.db.killmails.findOne({
                killmail_id: row.killmail_id
            });
            row.item_id = getVictim(killmail, 'item_id');
            row.character_id = getVictim(killmail, 'character_id');
            topisk.push(await app.util.info.fill(app, row));
        }
    }
    ret.topisk = topisk;

    return {
        json: ret
    };
}

function getVictim(killmail, type) {
    var involved = killmail.involved || {};
    var types = involved[type] || [];
    types.sort();
    var id = types.shift();
    if (id < 0) return (-1 * id);
    return id;
}

module.exports = f;