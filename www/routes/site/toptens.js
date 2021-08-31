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

    var mod = (req.params.epoch == 'week' ? 900 : (req.params.epoch == 'recent' ? 3600 : 86400));

    var ret = {
        types: {},
        topisk: []
    };
    ret.timespan = (req.params.epoch == 'week' ? 'Past 7 Days' : (req.params.epoch == 'recent' ? 'Past 90 Days' : 'Alltime'));

    var cached_row = await app.db.datacache.findOne({requrl: req.url});
    if (cached_row != null) {
        ret = JSON.parse(cached_row.data);
    } else {
        var pmm_key = req.params.epoch + ':' + req.params.type;
        while (pmm[pmm_key] != undefined) {
            await app.sleep(250);
        }
        try {
            pmm[pmm_key] = true;

            var start_time = app.now();
            var timestamp = start_time;
            timestamp = timestamp - (timestamp % mod);

            if (req.params.type == 'system') {
                req.params.type = 'solar_system';
            } else if (req.params.type == 'type') {
                req.params.type = 'item';
            }

            let query = {};
            var type, id, page = 0;

            var key;
            var query_or = [];
            var query_and = [];
            var kl = undefined;

            if (req.params.type == 'label' && req.params.id == 'all') {
                key = 'label';
                type = 'label';
                id = 'all';
                query = {};
            } else if (req.params.type == 'label') {
                key = 'label';
                type = 'label';
                id = req.params.id;
                query_and.push({
                    labels: id
                });
            } else if (req.params.type != 'all' && req.params.id != 'all') {
                type = req.params.type + '_id';
                id = parseInt(req.params.id);
                if (id == NaN) return { json: [], maxAge : 900}; // return an empty list

                var key = 'involved.' + type;
            };
            var record = await app.db.statistics.findOne({type: type, id: id});
            if (record == null) return { json: [], maxAge : 900}; // return an empty list

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

            var last_modifier = '';
            if (req.query['modifiers'] != undefined) {
                var modifiers = req.query['modifiers'].split(',');
                for (const modifier of modifiers) {
                    // Modifiers must be in alpha order and cannot be repeated
                    if (modifier <= last_modifier) return { json: [], maxAge : 900}; // return an empty list

                    switch (modifier) {
                        case 'killed':
                        case 'lost':
                            if (kl != undefined) return { json: [], maxAge : 900}; // return an empty list
                            kl = modifier;
                            break;
                        case 'current-month':
                            var date = new Date(), y = date.getFullYear(), m = date.getMonth();
                            var firstDay = new Date(y, m, 1);
                            // var lastDay = new Date(y, m + 1, 0);
                            query_and.push({epoch : {'$gte' : Math.floor(firstDay.getTime() / 1000) }});
                            ret.timespan = 'current month';
                            break;
                        case 'prior-month':
                            var date = new Date(), y = date.getFullYear(), m = date.getMonth();
                            var firstDay = new Date(y, m - 1, 1);
                            var lastDay = new Date(y, m + 1, 0);
                            query_and.push({epoch : {'$gte' : Math.floor(firstDay.getTime() / 1000) }});
                            query_and.push({epoch : {'$lt' : Math.floor(lastDay.getTime() / 1000) }});
                            ret.timespan = 'prior month';
                            break;
                        default:
                            query_and.push({
                                labels: modifier.replace(' ', '+')
                            });
                    }
                    last_modifier = modifier;
                }
            }

            if (kl == undefined) kl = 'killed';
            if (type == 'label') {
                if (id == 'all') query_or.push({});
                else query_or.push({label: id});
            } else {
                if (kl == 'killed') query_or.push({[key]: id});
                if (kl == 'lost') query_or.push({[key]: -1 * id});
            }

            if (query_and.length > 0) {
                query['$and'] = query_and;
            }

            if (query_or != undefined) query['$or'] = query_or;

            var collection = (req.params.epoch == 'week' ? 'killmails_7' : (req.params.epoch == 'recent' ? 'killmails_90' : 'killmails'));
            collection = (ret.timespan == 'current month' || ret.timespan == 'prior month' ? 'killmails_90' : collection);

            ret.topisk = app.util.stats.topISK(app, collection, query, type, 6, kl);
            for (var i = 0; i < types.length; i++) {
                ret.types[types[i]] = app.util.stats.group(app, collection, query, types[i], kl);
            }

            // Now wait for everything to finish
            ret.topisk = await ret.topisk;
            for (var i = 0; i < types.length; i++) {
                ret.types[types[i]] = await ret.types[types[i]];
                if (ret.types[types[i]] == undefined || ret.types[types[i]].length == 0) delete ret.types[types[i]];
            }

            if (Object.keys(ret.types).length == 0) delete ret.types;
            else await app.util.info.fill(app, ret.types);

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
            ret.killed_lost = kl;

            var next_update = timestamp + mod;
            ret.next_update = new Date(next_update * 1000);
            await app.db.datacache.insertOne({requrl : req.url, epoch: next_update, data : JSON.stringify(ret)});
        } finally { 
            delete pmm[pmm_key]; 
        }
    }

    return {
        json: ret,
        maxAge: mod
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