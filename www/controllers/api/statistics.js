'use strict';

module.exports = {
   paths: '/api/1hour/statistics/:type/:id.json',
   get: get
}

const utf8 = require('utf8');

async function get(req, res) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return {redirect: valid};


    let parsed = parseInt(req.params.id);
    req.params.id = parsed > 0 ? parsed : req.params.id;

    let result = await req.app.app.db.statistics.find({
        type: req.params.type,
        id: req.params.id
    }).toArray();

    return {
        json: (result.length == 1 ? result[0] : null),
        maxAge: 1
    };
}