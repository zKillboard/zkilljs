'use strict';

module.exports = {
   paths: ['/site/toptens/:epoch/:type/:id.html', '/cache/1hour/toptens/:epoch/:type/:id.html'],
   get: get
}

let types = [
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
let pmm = {};

async function get(req, res) {
    const app = req.app.app;

    let match = await app.util.match_builder(app, req, 'killed');

    let start_time = app.now();
    let timestamp = start_time;
    let mod = 300; // default, 5 minutes

    // Pull the stats record, do they have enough kills to warrant week long caches?
    let stats = app.db.statistics.findOne({type: match.type, id: match.id});
    let total = (stats.killed || 0) + (stats.lost || 0);
    if (total > 1000000) mod = 86400 * 7;
    else if (total >= 100000) mod = 86400;
    else if (total < 1000) mod = 30;
    else if (total < 100) mod = 15;

    timestamp = timestamp - (timestamp % mod); // daily


    let ret = {
        topisk: {},
        types: {}
    };

    let valid = {
        modifiers: 'string',
        timestamp: timestamp,
        required: ['timestamp', 'v'],
        v: app.server_started
    }
    req.alternativeUrl = '/cache/1hour/toptens/' + req.params.epoch + '/' + req.params.type + '/' + req.params.id + '.html';
    valid = req.verify_query_params(req, valid);
    if (valid !== true) {
        console.log('Redirecting to', valid);
        return {redirect: valid};
    }

    let pmm_key = match.epoch + '-' + match.type;
    while (pmm[pmm_key] != undefined) {
        await app.sleep(100); // poor man's mutex
    }

    try {
        pmm[pmm_key] = true;

        let cached = await app.db.datacache.findOne({requrl: req.url});
        if (cached != null) {
            ret = JSON.parse(cached.data);
        } else {
            ret.topisk = app.util.stats.topISK(app, match.collection, match.match, match.type, 6, match.kl);
            for (let i = 0; i < types.length; i++) {
                ret.types[types[i]] = app.util.stats.group(app, match.collection, match.match, types[i], match.kl);
            }

            // Now wait for everything to finish
            ret.topisk = await ret.topisk;
            for (let i = 0; i < types.length; i++) {
                ret.types[types[i]] = await ret.types[types[i]];
                if (ret.types[types[i]] == undefined || ret.types[types[i]].length == 0) delete ret.types[types[i]];
            }

            // Fill in the information from the raw data for the top tens
            if (Object.keys(ret.types).length == 0) delete ret.types;
            else await app.util.info.fill(app, ret.types);

            // Fill in the information for the top isk block
            let topisk = [];
            if (ret.topisk != undefined) {
                for (let i = 0; i < ret.topisk.length; i++) {
                    let row = ret.topisk[i];
                    let killmail = await app.db.killmails.findOne({
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

            let next_update = timestamp + mod;

            await app.db.datacache.deleteOne({requrl: req.url});
            await app.db.datacache.insertOne({requrl : req.url, epoch: next_update, data : JSON.stringify(ret)});
        }
        ret.epoch = req.params.epoch;
    } finally {
        delete pmm[pmm_key];
    }

    return {
        package: ret,
        ttl: 300,
        view: 'toptens.pug'
    };
}

function getVictim(killmail, type) {
    let involved = killmail.involved || {};
    let types = involved[type] || [];
    types.sort();
    let id = types.shift();
    if (id < 0) return (-1 * id);
    return undefined;
}