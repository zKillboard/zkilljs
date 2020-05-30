'use strict';

module.exports = getData;

async function getData(req, res) {
    let result = await req.app.app.db.killmails.find({
        killmail_id: parseInt(req.params.id)
    }).project({
        _id: 0,
        sequence: 0
    }).toArray();
    return {
        json: (result.length == 1 ? result[0] : null), magAge: 1
    };
}