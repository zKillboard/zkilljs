'use strict';

module.exports = {
   paths: '/cache/1hour/stats_box/:type/:id.json',
   get: getStats
}


async function getStats(req, res, app) {
    let parsed = (req.params.type != 'label' ? parseInt(req.params.id) : req.params.id);
    req.params.id = parsed > 0 ? parsed : req.params.id;

    let query = {
        type: (req.params.type == 'label' ? 'label' : req.params.type + '_id'),
        id: (req.params.type == 'label' ? req.params.id : Math.abs(parseInt(req.params.id)))
    };
    let result = await app.db.statistics.findOne(query);

    var data = {};
    data.labels = {};
    await add(app, result, data, 'alltime');
    await add(app, result, data, 'recent');
    await add(app, result, data, 'week');
    data.labels = Object.keys(data.labels).sort();

    var hash = app.md5(JSON.stringify(data));

    if (req.query.current_hash == hash) return {status_code: 204}; 
    var valid = {
        required: ['hash'],
        hash: hash
    }
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) return {redirect: valid};

    return {
        json: data,
        ttl: 3600
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
    //data[epoch + '-zgrade'] = get(result, epoch, 'grade');
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