'use strict';

module.exports = {
   paths: '/site/information/:type/:id.html',
   get: get
}

let all_labels = {};

async function get(req, res) {
    let valid = req.verify_query_params(req, {});
    if (valid !== true) return {redirect: valid};

    const app = req.app.app;

    if (req.params.type != undefined) req.params.type = req.params.type.toLowerCase();
    if (req.params.type == 'label' && req.params.id != undefined) req.params.id = req.params.id.toLowerCase();

    let query = {};
    if (req.params.type == 'label') query = {
        type: 'label',
        id: req.params.id
    };
    else {
        let id = parseInt(req.params.id);
        if (id == NaN) return {
            json: '[]'
        };
        query = {
            type: req.params.type + '_id',
            id: id
        };
    };

    // We don't have information for labels so we'll create it
    let result;
    if (query.type == 'label') {
        if (all_labels[query.type] === undefined) {
            all_labels[query.type] = await app.db.statistics.distinct('id', {type: 'label', id: {$ne: 'all'}});
            all_labels[query.type].unshift('all');

            let index = all_labels[query.type].indexOf(query.id);
            if (index >= 0) all_labels[query.type].splice(index, 1);
        }

        result = [{
            type: query.type,
            id: query.id,
            name: 'Label: ' + query.id,
            label_id: query.id,
            label_name: query.id,
            all_labels: all_labels[query.type]
        }];
    } else result = await req.app.app.db.information.find(query).toArray();

    result = result[0];

    if (result == undefined || result == null) result = {type: query.type, id: query.id};
    if (result.name == undefined) {
        result.name = req.params.type + ' ' + req.params.id;
    } else if (req.params.type == 'label') {
        result.name = req.params.id.toUpperCase() + ' Killmails';
    }

    if (result.type == 'corporation_id' && (result.ticker || '').length > 0) result.ticker = '[' + result.ticker + ']';
    if (result.type == 'alliance_id' && (result.ticker || '').length > 0) result.ticker = '<' + result.ticker + '>';

    result.page_title = result.name;

    let ret = {
        package: result,
        ttl: 3600,
        view: 'information.pug'
    };

    ret.package = await app.util.info.fill(app, ret.package);
    ret.package[req.params.type + '_id'] = ret.package.id;
    ret.package[req.params.type + '_name'] = ret.package.name;

    return ret;
}