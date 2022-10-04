'use strict';

module.exports = {
   paths: '/api/1hour/information/:type/:id.json',
   get: get
}

async function get(req, res, app) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return {redirect: valid};

    let query = {
        type: req.params.type + '_id',
        id: parseInt(req.params.id)
    };

    let result = await app.db.information.find(query).project({
        _id: 0,
        etag: 0,
        last_updated: 0,
    }).toArray();

    return {
        json: (result.length == 1 ? await app.util.info.fill(app, result[0]) : null),
        ttl: 3600
    };
}