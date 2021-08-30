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
        if (id == NaN) return {
            json: '[]'
        };

        var key = 'involved.' + type;
    };
    var record = await app.db.statistics.findOne({type: type, id: id});
    if (record == null) return { json: [] }; // return an empty list

    var valid = {
        modifiers: 'string',
        page: 'integer',
        sequence: record.sequence,
        required: ['page', 'sequence'],
    }
    req.alternativeUrl = '/cache/1hour/killmails/' + req.params.type + '/' + req.params.id + '.json';
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) {
        return valid;
    }

    var last_modifier = '';
    if (req.query['modifiers'] != undefined) {
        var modifiers = req.query['modifiers'].split(',');
        for (const modifier of modifiers) {
            // Modifiers must be in alpha order and cannot be repeated
            if (modifier <= last_modifier) return null; // 404

            if (modifier == 'killed' || modifier == 'lost') {
                if (kl != undefined) return null; // 404
                kl = modifier;
            } else {
                query_and.push({
                    labels: modifier.replace(' ', '+')
                });
            }
            last_modifier = modifier;
        }
    }

    if (kl == undefined) kl = 'all';
    if (type == 'label') {
        if (id == 'all') query_or.push({});
        else query_or.push({label: id});
    } else {
        if (kl == 'all' || kl == 'killed') query_or.push({[key]: id});
        if (kl == 'all' || kl == 'lost') query_or.push({[key]: -1 * id});
    }

    if (query_and.length > 0) {
        query['$and'] = query_and;
    }

    query['$or'] = query_or;
    page = Math.max(0, Math.min(9, req.query['page'])); // cannot go below 0 or above 9

    var killmails;
    var collections = ['killmails_7', 'killmails_90', 'killmails'];
    for (var i = 0; i < collections.length; i++) {
        var now = Date.now();
        let result = await app.db[collections[i]].find(query)
            .sort({ killmail_id: -1 })
            .skip(page * 50) // faster without a limit... 
            .limit(50)
            .batchSize(50);
        killmails = [];
        while (await result.hasNext()) {
            killmails.push((await result.next()).killmail_id)
            if (killmails.length >= 50) break;
        }
        console.log(query, '\n', collections[i], ((Date.now()) - now) + 'ms')
        if (killmails.length >= 50) break;
    }

    return {
        json: killmails,
        maxAge: 900,
    };
}

function get_sum(record, epoch) {
    if (record[epoch] == undefined || record[epoch] == 0) return 0;
    return (record[epoch].killed) || (record[epoch].lost || 0);
}