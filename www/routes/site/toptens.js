'use strict';

var types = [
    'character_id',
    'corporation_id',
    'alliance_id',
    'faction_id',
    'item_id',
    'group_id',
    'category_id',
    'location_id',
    'solar_system_id',
    'constellation_id',
    'region_id',
];

// poor man's mutex
var pmm = {};

async function f(req, res) {
    const app = req.app.app;

    var match = await app.util.match_builder(app, req, 'killed');

    var start_time = app.now();
    var timestamp = start_time;
    var mod = 900;
    timestamp = timestamp - (timestamp % mod);


    var ret = {
        topisk: {},
        types: {}
    };

    var valid = {
        modifiers: 'string',
        timestamp: timestamp,
        required: ['timestamp'],
    }
    req.alternativeUrl = '/cache/1hour/toptens/' + req.params.epoch + '/' + req.params.type + '/' + req.params.id + '.html';
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) {
        return valid;
    }

    if (match.epoch == 'alltime') {
        // Pull the stats record, do they have enough kills to warrant week long caches?
        var stats = app.db.statistics.findOne({type: match.type, id: match.id});
        var total = (stats.killed || 0) + (stats.lost || 0);
        if (total > 1000000) mod = 86400 * 7;
        else if (total >= 100000) mod = 86400;

        timestamp = timestamp - (timestamp % mod); // daily
    }

    var pmm_key = match.epoch + '-' + match.type;
    while (pmm[pmm_key] != undefined) {
        await app.sleep(100); // poor man's mutex
    }

    try {
        pmm[pmm_key] = true;

        var cached = await app.db.datacache.findOne({requrl: req.url});
        if (cached != null) {
            ret = JSON.parse(cached.data);
        } else {
            ret.topisk = app.util.stats.topISK(app, match.collection, match.match, match.type, 6, match.kl);
            for (var i = 0; i < types.length; i++) {
                ret.types[types[i]] = app.util.stats.group(app, match.collection, match.match, types[i], match.kl);
            }

            // Now wait for everything to finish
            ret.topisk = await ret.topisk;
            for (var i = 0; i < types.length; i++) {
                ret.types[types[i]] = await ret.types[types[i]];
                if (ret.types[types[i]] == undefined || ret.types[types[i]].length == 0) delete ret.types[types[i]];
            }

            // Fill in the information from the raw data for the top tens
            if (Object.keys(ret.types).length == 0) delete ret.types;
            else await app.util.info.fill(app, ret.types);

            // Fill in the information for the top isk block
            var topisk = [];
            if (ret.topisk != undefined) {
                for (var i = 0; i < ret.topisk.length; i++) {
                    var row = ret.topisk[i];
                    var killmail = await app.db.killmails.findOne({
                        killmail_id: row.killmail_id
                    });
                    row.item_id = getVictim(killmail, 'item_id');
                    row.character_id = getVictim(killmail, 'character_id');
                    row.corporation_id = getVictim(killmail, 'corporation_id');
                    topisk.push(await app.util.info.fill(app, row));
                }
            }
            ret.topisk = topisk;
            ret.killed_lost = match.kl || '';

            var next_update = timestamp + mod;

            await app.db.datacache.deleteOne({requrl: req.url});
            await app.db.datacache.insertOne({requrl : req.url, epoch: next_update, data : JSON.stringify(ret)});
        }
    } finally {
        delete pmm[pmm_key];
    }

    return {
        json: ret,
        maxAge: 0
    };
}

function getVictim(killmail, type) {
    var involved = killmail.involved || {};
    var types = involved[type] || [];
    types.sort();
    var id = types.shift();
    if (id < 0) return (-1 * id);
    return undefined;
}

module.exports = f;