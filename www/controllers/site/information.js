'use strict';

module.exports = {
   paths: '/site/information/:type/:id.html',
   get: get
}

async function get(req, res) {
    var valid = req.verify_query_params(req, {});
    if (valid !== true) return {redirect: valid};

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

    //if (result.length == 0) return {package: {}};


    result = result[0];

    if (result.name == undefined) {
        result.name = req.params.type + ' ' + req.params.id;
    } else if (req.params.type == 'label') {
        result.name = req.params.id.toUpperCase() + ' Killmails';
    }

    if (result.type == 'corporation_id') result.ticker = '[' + result.ticker + ']';
    if (result.type == 'alliance_id') result.ticker = '<' + result.ticker + '>';

    var ret = {
        package: result,
        page_title: result.name,
        maxAge: 0,
        view: 'information.pug'
    };

    ret.package = await app.util.info.fill(app, ret.package);
    ret.package[req.params.type + '_id'] = ret.package.id;
    ret.package[req.params.type + '_name'] = ret.package.name;

    return ret;
}