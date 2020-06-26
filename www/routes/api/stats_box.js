'use strict';

async function getData(req, res) {
    let parsed = (req.params.type != 'label' ? parseInt(req.params.id) : req.params.id);
    req.params.id = parsed > 0 ? parsed : req.params.id;

    var epoch = Number.parseInt(req.query.epoch || 0);
    epoch = epoch - (epoch % 15);
    var valid = {
        epoch: epoch
    }
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) return valid;

    let query = {
        type: (req.params.type == 'label' ? 'label' : req.params.type + '_id'),
        id: (req.params.type == 'label' ? req.params.id : Math.abs(parseInt(req.params.id)))
    };
    let result = await req.app.app.db.statistics.findOne(query);

    var data = {};
    add(result, data, 'alltime');
    add(result, data, 'recent');
    add(result, data, 'week');

    return {
        json: data,
        maxAge: 3600
    };
}

function add(result, data, type) {
    data[type + '-kills'] = get(result, type, 'killed');
    data[type + '-isk-killed'] = get(result, type, 'isk_killed');
    data[type + '-lost'] = get(result, type, 'lost');
    data[type + '-isk-lost'] = get(result, type, 'isk_lost');

}

function get(result, part1, part2) {
    if (result != undefined && result[part1] != undefined && result[part1][part2] != undefined) return result[part1][part2];
    return '';
}

module.exports = getData;