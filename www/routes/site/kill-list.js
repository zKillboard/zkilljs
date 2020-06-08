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
    if (req.params.type == 'label') query['labels'] = req.params.id;
    else if (req.params.type != 'all' && req.params.id != 'all') {
        var id = parseInt(req.params.id);
        if (id == NaN) return {
            json: '[]'
        };

        var key = 'involved.' + req.params.type + '_id';
        query['$or'] = [{
            [key]: id
        }, {
            [key]: (-1 * id)
        }];
    };

    let result = await app.db.killmails.find(query)
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