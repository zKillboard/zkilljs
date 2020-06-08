'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;

    let query = {
        type: req.params.type + '_id',
        id: parseInt(req.params.id)
    };

    let result = await req.app.app.db.information.find(query).toArray();

    if (result.length == 0) return null; 

    var ret = {
        json: result[0],
        maxAge: 3600
    };

    ret.json = await app.util.info.fill(app, ret.json);
    ret.json[req.params.type + '_id'] = ret.json.id;
    ret.json[req.params.type + '_name'] = ret.json.name;
    return ret;
}