'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;

    if (req.params.type == 'system') {
        req.params.type = 'solar_system';
    } else if (req.params.type == 'type') {
        req.params.type = 'item';
    }

    let query = {};
    var type, id, page = 0;
    var query_or = undefined;

    var query_and = [];

    if (req.params.type == 'label' && req.params.id == 'all') {
        type = 'label';
        id = 'all';
        query = {};
    } else if (req.params.type == 'label') {
        type = 'label';
        id = req.params.id;
        query_and.push({
            labels: id
        });
    } else if (req.params.type != 'all' && req.params.id != 'all') {
        type = req.params.type + '_id';
        id = parseInt(req.params.id);
        if (id == NaN) return {
            json: '[]'
        };

        var key = 'involved.' + type;
        query_or = [];
        if (req.query['kl'] == 'all' || req.query['kl'] == 'killed') query_or.push({[key]: id});
        if (req.query['kl'] == 'all' || req.query['kl'] == 'lost') query_or.push({[key]: -1 * id});
    };
    var record = await app.db.statistics.findOne({
        type: type,
        id: id
    });

    if (record == null) {
        // return an empty list
        return {
            json: []
        };
    }

    var valid = {
        modifiers: 'string',
        page: 'integer',
        sequence: record.sequence,
        kl: ['all', 'killed', 'lost'],
        required: ['kl', 'page', 'sequence'],
    }
    req.alternativeUrl = '/cache/1hour/killmails/' + req.params.type + '/' + req.params.id + '.json';
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) return valid;

    var last_modifier = '';
    if (req.query['modifiers'] != undefined) {
        var modifiers = req.query['modifiers'].split(',');
        for (const modifier of modifiers) {
            // Modifiers must be in alpha order and cannot be repeated
            if (modifier <= last_modifier) return null; // 404

            if (modifier == 'killed') {
                if (type != 'label') query_or = [{
                    [key]: id
                }];
            } else if (modifier == 'lost') {
                if (type != 'label') query_or = [{
                    [key]: (-1 * id)
                }];
            } else if (modifier == 'pvp') {
                query_and.push({labels: 'pvp'});
            } else {
                query_and.push({
                    labels: modifier.replace(' ', '+')
                });
            }
            last_modifier = modifier;
        }
    }
    if (query_and.length > 0) {
        query['$and'] = query_and;
    }

    if (query_or != undefined) query['$or'] = query_or;
    page = req.query['page'];

    var killmails;
    var collections = ['killmails_7', 'killmails_90', 'killmails'];
    for (var i = 0; i < collections.length; i++) {
        let result = await app.db[collections[i]].find(query)
            .sort({
                killmail_id: -1
            })
            .skip(page * 50) // faster without a limit... 
            .batchSize(50);
        killmails = [];
        while (await result.hasNext()) {
            killmails.push((await result.next()).killmail_id)
            if (killmails.length >= 50) break;
        }
        if (killmails.length >= 50) break;
    }

    return {
        json: killmails
    };
}

function get_sum(record, epoch) {
    if (record[epoch] == undefined || record[epoch] == 0) return 0;
    return (record[epoch].killed) || (record[epoch].lost || 0);
}