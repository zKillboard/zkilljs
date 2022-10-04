'use strict';

module.exports = {
    exec: f,
    span: -1
}

const types = [
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

const collections = {
    week: 'killmails_7',
    //recent: 'killmails_90',
    //alltime: 'killmails',
};

let concurrent = 0;

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    if (!app.no_api && app.dbstats.total >= 100) return;
    if (app.dbstats.stats_total >= 1000) return;

    let promises = [];
    
    let epochs = Object.keys(collections);
    for (let i = 0; i < epochs.length; i++) {
        promises.push(do_epoch(app, epochs[i]));
    }
    await app.waitfor(promises);
}

async function do_epoch(app, epoch) {
    let promises = [];
    let iterator = await app.db.statistics.find({[epoch + '.update_top']: true}).limit(10000);
    while (await iterator.hasNext()) {
        if (app.bailout) return;

        while (app.bailout != true && concurrent >= 10) await app.sleep(10);

        concurrent++;
        promises.push(do_update(app, epoch, await iterator.next()));
    }
    await iterator.close();
    await app.waitfor(promises);
}

async function do_update(app, epoch, record) {
    try {
        if (app.dbstats.total > 100) return await app.sleep(1000);

        let last_sequence = record.last_sequence;
        let oldhash = (record.week == undefined ? '' : record.week.hash_killed_top);

        let match = {};
        if (record.type == 'label' && record.id == 'all') {
            // no match, we want all of the killmails
        } else {
            match['involved.' + record.type] = record.id;
            if (record.type != 'label' && record.id != 'pvp') match['involved.label'] = 'pvp';
        }

        let top_killers = await do_queries(app, collections[epoch], record, match, record[epoch].killed_top, (record[epoch].killed || 0), 'killed');

        let top_losers;
        if (record.type != 'label') {
            match['involved.' + record.type] = -1 * record.id;
            top_losers = await do_queries(app, collections[epoch], record, match, record[epoch].lost_top, (record[epoch].lost || 0), 'lost');
        } else top_losers = {};

        let n = await app.db.statistics.updateOne({
            _id: record._id,
            last_sequence: last_sequence
        }, {
            $set: {
                [epoch + '.killed_top']: top_killers,
                [epoch + '.lost_top']: top_losers,
                [epoch + '.hash_killed_top']: app.md5(JSON.stringify(top_killers) + JSON.stringify(top_losers)),
                [epoch + '.hash_lost_top']: app.md5(JSON.stringify(top_losers)),
                [epoch + '.update_top']: false
            }
        });
        let redis_base = JSON.stringify({
            type: record.type,
            id: record.id
        });
        await app.redis.sadd('zkilljs:toplists:publish', redis_base);
        app.util.ztop.zincr(app, 'stats_toplist_' + epoch);
    } finally {
        concurrent--;
    }
}

async function do_queries(app, collection, record, match, existing, total_kills, killed_lost) {
    let ret = {
        types: {},
        topisk: []
    };

    // Start the top Isk query
    let topIsk = await app.util.stats.topISK(app, collection, match, record.type, 6, killed_lost);

    // Compare to see if we need to actually do these expensive group queries
    let last_total = (existing ? (existing['last_topten_total_' + killed_lost] || 0) : 0);
    if (total_kills < 10000 || ((total_kills - last_total) > Math.floor(last_total * 0.01))) {
        // Start the group queries
        for (let i = 0; i < types.length; i++) {
            ret.types[types[i]] = app.util.stats.group(app, collection, match, types[i], killed_lost);
        }

        // and wait for all the queries to finish
        for (let i = 0; i < types.length; i++) {
            ret.types[types[i]] = await ret.types[types[i]];
            if (ret.types[types[i]] == undefined || ret.types[types[i]].length == 0) delete ret.types[types[i]];
        }
    } else {
        ret = existing;
    }
    ret['last_topten_total_' + killed_lost] = total_kills;

    ret.topisk = [];
    topIsk = await topIsk;
    for (let i = 0; i < topIsk.length; i++) {
        let record = topIsk[i];
        delete record._id;
        ret.topisk.push(record);
    }
    return ret;
}
