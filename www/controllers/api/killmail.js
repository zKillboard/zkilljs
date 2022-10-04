'use strict';

module.exports = {
   paths: '/api/1hour/killmail/:id.json',
   get: get
}

async function get(req, res, app) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return {redirect: valid};

    let result = await app.db.killmails.find({
        killmail_id: parseInt(req.params.id)
    }).project({
        _id: 0,
        sequence: 0
    }).toArray();
    return {
        json: (result.length == 1 ? result[0] : null),
        magAge: 3600
    };
}