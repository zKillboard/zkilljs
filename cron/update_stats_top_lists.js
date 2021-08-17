'use strict';

var types = [
    'character_id',
    'corporation_id',
    'alliance_id',
    'faction_id',
    'item_id',
    'group_id',
    'region_id',
    'constellation_id',
    'solar_system_id',
    'location_id',
];

var collections = {
    //alltime: 'killmails',
    //recent: 'killmails_90',
    week: 'killmails_7'
};

var sequential = 0;

async function f(app) {
    try {        
        app.toptens = true;

        var epochs = Object.keys(collections);

        for (var e = 0; e < epochs.length; e++) {
            var epoch = epochs[e];

            var result = await app.db.statistics.find({
                [epoch + '.update_top']: true,
            });
            while (await result.hasNext()) {
                //if (app.delay_stat) return await app.randomSleep(1000, 3000);
                if (app.bailout) return;

                var row = await result.next();
                while (sequential > 10) await app.sleep(1);
                do_update(app, epoch, row);
                app.zincr('stats_toplist_' + epoch);
            }
        }
        while (sequential > 0) await app.sleep(1);
    } finally {
        app.toptens = false;
    }
}

async function do_update(app, epoch, row) {
    try {
        sequential++;
        var last_sequence = row.last_sequence;
        var oldhash = (row.week == undefined ? '' : row.week.hash_killed_top);

        var match = {
            [row.type == 'label' ? 'labels' : 'involved.' + row.type]: row.id,
            stats: true
        };
        if (row.type == 'label' && row.id == 'all') delete match.labels;
        var top_killers = do_queries(app, collections[epoch], match, 'killed');

        match = {
            [row.type == 'label' ? 'labels' : 'involved.' + row.type]: (-1 * row.id),
            stats: true
        };
        var top_losers = do_queries(app, collections[epoch], match, 'lost');
        top_killers = await top_killers;
        top_losers = await top_losers;
        var newhash = app.md5(JSON.stringify(top_killers));

        var n = await app.db.statistics.updateOne({
            _id: row._id,
            last_sequence: last_sequence
        }, {
            $set: {
                [epoch + '.killed_top']: top_killers,
                [epoch + '.lost_top']: top_losers,
                [epoch + '.hash_killed_top']: newhash,
                [epoch + '.hash_lost_top']: app.md5(JSON.stringify(top_losers)),
                [epoch + '.update_top']: false
            }
        });
        let redis_base = JSON.stringify({
            type: row.type,
            id: row.id
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
    // Start the queries
    for (var i = 0; i < types.length; i++) {
        ret.types[types[i]] = app.util.stats.group(app, collection, match, types[i], killed_lost);
    }
    var stats = app.util.stats.topISK(app, collection, match, 6);
    // and wait for them to finish
    for (var i = 0; i < types.length; i++) {
        ret.types[types[i]] = await ret.types[types[i]];
        if (ret.types[types[i]] == undefined || ret.types[types[i]].length == 0) delete ret.types[types[i]];
    }
    stats = await stats;
    for (var i = 0; i < stats.length; i++) {
        var row = stats[i];
        delete row._id;
        ret.topisk.push(row);
    }
    return ret;
}

module.exports = f;