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

    if (req.params.type == 'label' && req.params.id == 'all') {
        type = 'label';
        id = 'all';
        query = {};
    } else if (req.params.type == 'label') {
        type = 'label';
        id = req.params.id;
        query['labels'] = req.params.id;
    } else if (req.params.type != 'all' && req.params.id != 'all') {
        type = req.params.type + '_id';
        id = parseInt(req.params.id);
        if (id == NaN) return {
            json: '[]'
        };

        var key = 'involved.' + type;
        query_or = [{
            [key]: id
        }, {
            [key]: (-1 * id)
        }];
    };
    var record = await app.db.statistics.findOne({
        type: type,
        id: id 
    });

    var valid = {
        modifiers: 'string',
        page: 'integer',
        sequence: record.sequence,
        required: ['page', 'sequence'],
    }
    req.alternativeUrl = '/cache/1hour/killmails/' + req.params.type + '/' + req.params.id + '.html';
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) return valid;

    var last_modifier = '';
    if (req.query['modifiers'] != undefined) {
        var modifiers = req.query['modifiers'].split(',');
        for (const modifier of modifiers) {
            // Modifiers must be in alpha order and cannot be repeated
            if (modifier <= last_modifier) return null; // 404

            if (modifier == 'killed') {
                query_or = [{
                    [key]: id
                }];
            } else if (modifier == 'lost') {
                query_or = [{
                    [key]: (-1 * id)
                }];
            } else if (modifier == 'npc') {
                query['stats'] = false;
            } else if (modifier == 'pvp') {
                query['stats'] = true;
            } else {
                query.labels = modifier;
            }
            last_modifier = modifier;
        }
    }
    if (query_or != undefined) query['$or'] = query_or;
    page = req.query['page'];

    var collection = (get_sum(record, 'week') >= 50 ? 'killmails_7' : (get_sum(record, 'recent') >= 50 ? 'killmails_90' : 'killmails'));

    let result = await app.db[collection].find(query)
        .sort({
            killmail_id: -1
        })
        .skip(page * 50)
        .limit(50)
        .toArray();

    return {
        json: result,
        maxAge: 1
    };
}

function get_sum(record, epoch) {
    if (record[epoch] == undefined || record[epoch] == 0) return 0;
    return (record[epoch].killed) || (record[epoch].lost || 0);
}