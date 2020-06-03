'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;

    let query = {
        type: req.params.type + '_id',
        id: parseInt(req.params.id)
    };

    let result = await req.app.app.db.statistics.find(query).toArray();

    var ret = {
        json: result[0],
        maxAge: 1
    };

    return ret;
}