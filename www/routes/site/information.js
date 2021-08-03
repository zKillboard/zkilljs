'use strict';

module.exports = getData;

async function getData(req, res) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return valid;

    const app = req.app.app;

    let query = {};
    if (req.params.type == 'label') query = {
        type: 'label',
        id: req.params.id
    };
    else {
        var id = parseInt(req.params.id);
        if (id == NaN) return {
            json: '[]'
        };
        query = {
            type: req.params.type + '_id',
            id: id
        };
    };

    // We don't have information (yet?) for labels
    let result;
    if (query.type == 'label') {
        result = [{
            type: query.type,
            id: query.id,
            name: 'Label: ' + query.id,
            label_id: query.id,
            label_name: query.id,
        }];
    } else result = await req.app.app.db.information.find(query).toArray();

    if (result.length == 0) return null;


    result = result[0];

    if (result.name == undefined) {
        result.name = req.params.type + ' ' + req.params.id;
    }

    var ret = {
        json: result,
        page_title: result.name,
        maxAge: 3600
    };

    ret.json = await app.util.info.fill(app, ret.json);
    ret.json[req.params.type + '_id'] = ret.json.id;
    ret.json[req.params.type + '_name'] = ret.json.name;

    return ret;
}