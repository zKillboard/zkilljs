'use strict';

module.exports = {
   paths: '/api/1hour/killmails/:date/:type/:id.json',
   get: get
}

async function get(req, res) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return {redirect: valid};

    let query = {};
    if (req.params.type == 'label') query['labels'] = req.params.id;
    else {
        var id = parseInt(req.params.id);
        var key = 'involved.' + req.params.type;
        query['$or'] = [{
            [key]: id
        }, {
            [key]: (-1 * id)
        }];
    }

    var dateString = req.params.date;
    var year = dateString.substring(0, 4);
    var month = dateString.substring(4, 6);
    var day = dateString.substring(6, 8);

    var date = new Date(year, month - 1, day);
    var startEpoch = date.getTime() / 1000;
    date.setDate(date.getDate() + 1);
    var endEpoch = date.getTime() / 1000;

    query['$and'] = [{
        epoch: {
            $gte: startEpoch
        }
    }, {
        epoch: {
            $lt: endEpoch
        }
    }];

    let result = await req.app.app.db.killmails.find(query)
        .project({
            _id: 0,
            killmail_id: 1,
            hash: 1
        }).toArray();

    return {
        json: result,
        ttl: 86400
    };
}