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
    var match;

    var epoch = Math.floor(Date.now() / 1000);
    epoch = epoch - (epoch % 60);
    var valid = {
        required: ['epoch'],
        epoch: epoch
    }
    req.alternativeUrl = '/cache/1hour/toptens/' + req.params.type + '/' + req.params.id + '.html';
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) return valid;

    let query = {
        type: (req.params.type == 'label' ? 'label' : req.params.type + '_id'),
        id: (req.params.type == 'label' ? req.params.id : Math.abs(parseInt(req.params.id)))
    };
    if (query.type == 'label' && query.id == 'all') match = {};
    else if (query.type == 'label') match = query;
    else match = {
        ['involved.' + query.type]: query.id
    }
    match['stats'] = true;

    var ret = {
        types: {}
    };
    // Start the queries
    for (var i = 0; i < types.length; i++) {
        ret.types[types[i]] = app.util.stats.group(app, 'killmails_7', match, types[i]);
    }
    var stats = app.util.stats.topISK(app, 'killmails_7', match, 6);
    // and wait for them to finish
    for (var i = 0; i < types.length; i++) {
        ret.types[types[i]] = await ret.types[types[i]];
        if (ret.types[types[i]] == undefined || ret.types[types[i]].length == 0) delete ret.types[types[i]];
    }
    ret = await app.util.info.fill(app, ret);
    stats = await stats;
    ret.top10 = [];
    for (i = 0; i < stats.length; i++) {
    	var row = stats[i];
    	var killmail = await app.db.killmails.findOne({killmail_id: row.killmail_id});
    	row.character_id = getVictim(killmail, 'character_id');
    	row.item_id = getVictim(killmail, 'item_id');
    	ret.top10.push(await app.util.info.fill(app, row));
    }

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
