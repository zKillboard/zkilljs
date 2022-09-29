'use strict';

module.exports = {
   paths: ['/site/toptens.html', '/cache/1hour/toptens.html'],
   get: get,
   ttl: 900
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
    'label',
];

// poor man's mutex
let pmm = {};

async function get(req, res) {
    const app = req.app.app;

    let match = await app.util.match_builder(app, req);

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

    let valid = {
        modifiers: 'string',
        type: 'string',
        id: 'string',
        timestamp: timestamp,
        required: ['timestamp', 'v', 'type', 'id'],
        v: app.server_started
    }
    req.alternativeUrl = '/cache/1hour/toptens.html';
    valid = req.verify_query_params(req, valid);
    if (valid !== true) {
        return {redirect: valid};
    }

    let pmm_key = match.epoch + '-' + match.type;
    while (pmm[pmm_key] != undefined) {
        await app.sleep(100); // poor man's mutex
    }

    let ret;
    try {
        pmm[pmm_key] = true;

        ret = {
            topisk: {},
            types: {},
            distinct: {}
        };

        // Start all of the queries
        ret.topisk = app.util.stats.topISK(app, match.collection, match.match, match.type, 6, match.kl);
        for (let type of types) {
            ret.types[type] = app.util.stats.group(app, match.collection, match.match, type, match.kl);
            ret.distinct[type] = app.util.stats.distinct_count(app, match.collection, match.match, type, match.kl);
        }

        // Now wait for everything to finish
        ret.topisk = await ret.topisk;
        for (let type of types) {
            ret.types[type] = await ret.types[type];
            ret.distinct[type] = await ret.distinct[type];
            if (ret.types[type] == undefined || ret.types[type].length == 0) {
                delete ret.types[type];
                delete ret.distinct[type];
            }
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

        ret.epoch = match.epoch;
        ret.timespan = match.timespan;
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