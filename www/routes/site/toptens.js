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

    let epoch = req.params.epoch;
    if (epoch == undefined) epoch = 'week';
    if (epoch != 'week' && epoch != 'recent' && epoch != 'alltime') epoch = 'week';
    
    var killed_lost = req.params.killed_lost;
    if (killed_lost != 'killed' && killed_lost != 'lost') killed_lost = 'killed';

    let query = {
        type: (req.params.type == 'label' ? 'label' : req.params.type + '_id'),
        id: (req.params.type == 'label' ? req.params.id : Math.abs(parseInt(req.params.id)))
    };

    var record = await app.db.statistics.findOne(query);
    if (record[epoch] == undefined) record[epoch] = {};
    if (record[epoch]['hash_' + killed_lost + '_top'] == undefined) record[epoch].hash_killed_top = app.md5(record[epoch][killed_lost + '_top'])

    // if (req.query.current_hash == record[epoch].hash_killed_top) return 204;
    var valid = {
        required: ['hash'],
        hash: record[epoch]['hash_' + killed_lost + '_top']
    }
    req.alternativeUrl = '/cache/1hour/toptens/' + epoch + '/' + killed_lost + '/' + req.params.type + '/' + req.params.id + '.html';
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) return valid;

    if (record[epoch][killed_lost + '_top'] == undefined) return {
        json: {}
    }; // empty, do nothing

    var key_top = killed_lost + '_top';
    var ret = await app.util.info.fill(app, record[epoch][key_top]);
    ret.numDays = (epoch == 'week' ? '7' : (epoch == 'recent' ? '90' : 'Alltime'));
    ret.killed_lost = killed_lost;
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