'use strict';

module.exports = getData;

async function getData(req, res) {
    let result = await req.app.app.db.information.find({
        type: req.params.type,
        id: parseInt(req.params.id)
    }).project({
        _id: 0,
        etag: 0,
        last_updated: 0,
    }).toArray();
    return {
        json: (result.length == 1 ? result[0] : null)
    };
}