'use strict';

module.exports = getData;

async function getData(req, res) {
    let query = {};
    if (req.params.type == 'label') query['labels'] = req.params.id;
    else if (req.params.type != 'all' && req.params.id != 'all') {
        var id = parseInt(req.params.id);
        if (id == NaN) return { json: '[]'};

        var key = 'involved.' + req.params.type;
        query['$or'] = [{[key]: id}, {[key]: (-1 * id)}];
    }

    let result = await req.app.app.db.killmails.find(query)
        .sort({killmail_id: -1})
        .limit(50)
        .project({
            _id: 0,
            killmail_id: 1,
            hash: 1
    }).toArray();

    return {
        json: result, maxAge: 60
    };
}