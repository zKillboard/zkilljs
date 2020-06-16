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
    var type, id;
    if (req.params.type == 'label' && req.params.id == 'all') {
        type = 'label';
        id = 'all';
        query = {};
    }
    else if (req.params.type == 'label') {
        type = 'label';
        id = req.params.id;
        query['labels'] = req.params.id;
    }
    else if (req.params.type != 'all' && req.params.id != 'all') {
        type = req.params.type + '_id';
        id = parseInt(req.params.id);
        if (id == NaN) return {
            json: '[]'
        };

        var key = 'involved.' + type;
        query['$or'] = [{
            [key]: id
        }, {
            [key]: (-1 * id)
        }];
    };
    var record = await app.db.statistics.findOne({type: type, id: id});
    var collection = (get_sum(record, 'week') >= 50 ? 'killmails_7' : (get_sum(record, 'recent') >= 50 ? 'killmails_90' : 'killmails'));

    let result = await app.db[collection].find(query)
        .sort({
            killmail_id: -1
        })
        .limit(50)
        .toArray();

    return {
        json: result,
        maxAge: 1
    };
}

function get_sum(record, epoch) {
    if (record[epoch] == 0) return 0;
    return (record[epoch].killed) || (record[epoch].lost || 0);
}