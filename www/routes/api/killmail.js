'use strict';

module.exports = getData;

async function getData(req, res) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return valid;

    let result = await req.app.app.db.killmails.find({
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