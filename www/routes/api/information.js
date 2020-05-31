'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;
    
    let query = {
        type: req.params.type + '_id',
        id: parseInt(req.params.id)
    };

    let result = await req.app.app.db.information.find(query).project({
        _id: 0,
        etag: 0,
        last_updated: 0,
    }).toArray();

    return {
        json: (result.length == 1 ? await app.util.info.fill(req.app.app, result[0]) : null), maxAge: 3600
    };
}