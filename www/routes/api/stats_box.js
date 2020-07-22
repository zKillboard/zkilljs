'use strict';

async function getData(req, res) {
    let parsed = (req.params.type != 'label' ? parseInt(req.params.id) : req.params.id);
    req.params.id = parsed > 0 ? parsed : req.params.id;

    const app = req.app.app;

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
    data.labels = {};
    await add(app, result, data, 'alltime');
    await add(app, result, data, 'recent');
    await add(app, result, data, 'week');
    data.labels = Object.keys(data.labels).sort();

    return {
        json: data,
        maxAge: 3600
    };
}

async function add(app, result, data, epoch) {
    if (result == undefined) return;
    var rank = await app.redis.zrevrank('zkilljs:ranks:' + result.type + ':' + epoch, result.id);

    data[epoch + '-kills'] = get(result, epoch, 'killed');
    data[epoch + '-isk-killed'] = get(result, epoch, 'isk_killed');
    data[epoch + '-rank'] = (rank != null ? rank + 1 : '');
    data[epoch + '-lost'] = get(result, epoch, 'lost');
    data[epoch + '-isk-lost'] = get(result, epoch, 'isk_lost');
    data[epoch + '-eff'] = get(result, epoch, 'eff');
    data[epoch + '-dangerlevel'] = get(result, epoch, 'snuggly');
    data[epoch + '-solopct'] = get(result, epoch, 'solo');
    data[epoch + '-avg-inv-cnt'] = get(result, epoch, 'avg_inv_cnt');
    data[epoch + '-zscore'] = get(result, epoch, 'score');

    var labels = get(result, epoch, 'labels');
    var keys = Object.keys(labels == '' ? {} : labels);
    for (var i = 0; i < keys.length; i++) {
        data.labels[keys[i]] = true;
    }
}

function get(result, part1, part2) {
    if (result != undefined && result[part1] != undefined && result[part1][part2] != undefined) return result[part1][part2];
    return '';
}

module.exports = getData;