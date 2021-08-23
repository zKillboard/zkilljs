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

var collections = {
    week: 'killmails_7',
    //recent: 'killmails_90',
    //alltime: 'killmails',
};

var sequential = 0;
var first_run = true;

async function f(app) {
    if (first_run) {
        var epochs = Object.keys(collections);
        for (var i = 0; i < epochs.length; i++) {
            do_epoch(app, epochs[i]);
        }
        first_run = false;
    }
}

async function do_epoch(app, epoch) {
    var iterated = false;
    try {
        var result = await app.db.statistics.find({[epoch + '.update_top']: true}).limit(1000);
        while (await result.hasNext()) {
            if (app.bailout || app.no_stats || app.delay_stats) return;

            await do_update(app, epoch, await result.next());
            iterated = true;

            app.zincr('stats_toplist_' + epoch);
        }
    } finally {
        setTimeout(function() { do_epoch(app, epoch); }, (iterated == true ? 1 : 1000));
    }
}

async function do_update(app, epoch, record) {
    try {
        sequential++;
        var last_sequence = record.last_sequence;
        var oldhash = (record.week == undefined ? '' : record.week.hash_killed_top);

        var match = {};
        if (record.type == 'label' && record.id == 'all') {
            // no match, we want all of the killmails
        } else if (record.type == 'label') {
            match['labels'] = record.id;
        } else {
            match['involved.' + record.type] = record.id;
            match.labels = 'pvp';
        }

        var top_killers = await do_queries(app, collections[epoch], match, 'killed');

        if (record.type != 'label') match['involved.' + record.type] = -1 * record.id;

        var top_losers = await do_queries(app, collections[epoch], match, 'lost');

        var n = await app.db.statistics.updateOne({
            _id: record._id,
            last_sequence: last_sequence
        }, {
            $set: {
                [epoch + '.killed_top']: await top_killers,
                [epoch + '.lost_top']: await top_losers,
                [epoch + '.hash_killed_top']: app.md5(JSON.stringify(await top_killers) + JSON.stringify(await top_losers)),
                [epoch + '.hash_lost_top']: app.md5(JSON.stringify(await top_losers)),
                [epoch + '.update_top']: false
            }
        });
        let redis_base = JSON.stringify({
            type: record.type,
            id: record.id
        });
        await app.redis.sadd('zkilljs:toplists:publish', redis_base);
    } finally {
        sequential--;
    }
}

async function do_queries(app, collection, match, killed_lost) {
    var ret = {
        types: {},
        topisk: []
    };

    // Start the top Isk query
    var topIsk = app.util.stats.topISK(app, collection, match, 6, killed_lost);

    // Start the group queries
    for (var i = 0; i < types.length; i++) {
        ret.types[types[i]] = app.util.stats.group(app, collection, match, types[i], killed_lost);
    }

    // and wait for all the queries to finish
    for (var i = 0; i < types.length; i++) {
        ret.types[types[i]] = await ret.types[types[i]];
        if (ret.types[types[i]] == undefined || ret.types[types[i]].length == 0) delete ret.types[types[i]];
    }
    topIsk = await topIsk;
    for (var i = 0; i < topIsk.length; i++) {
        var record = topIsk[i];
        delete record._id;
        ret.topisk.push(record);
    }
    return ret;
}

module.exports = f;
