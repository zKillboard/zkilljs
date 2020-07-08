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
    await add(app, result, data, 'alltime');
    await add(app, result, data, 'recent');
    await add(app, result, data, 'week');

    return {
        json: data,
        maxAge: 3600
    };
}

async function add(app, result, data, epoch) {
    var rank = await app.redis.zrevrank('zkilljs:ranks:' + result.type + ':' + epoch, result.id);

    var killed = get(result, epoch, 'killed');
    var lost = get(result, epoch, 'lost');
    var kisk = get(result, epoch, 'isk_killed');
    var lisk = get(result, epoch, 'isk_lost')

    var solokills;
    try {
        solokills = result[epoch]['labels']['solo']['killed'];
        if (solokills == undefined) solokills = 0;
    } catch (e) {
        solokills = 0;
    }
    data[epoch + '-solo-kills'] = solokills;

    data[epoch + '-kills'] = killed;
    data[epoch + '-isk-killed'] = kisk;
    data[epoch + '-rank'] = (rank != null ? rank + 1 : '');
    data[epoch + '-lost'] = lost;
    data[epoch + '-isk-lost'] = lisk;

    var dangerlevel = get(result, epoch, 'danger_level');
    if (isNaN(dangerlevel)) {
        data[epoch + '-dangerlevel'] = 'hide';
        data[epoch + '-dangerlevel-inverse'] = 'hide';
    } else {
        data[epoch + '-dangerlevel'] = (dangerlevel != undefined && !isNaN(dangerlevel) ? Math.round(100 * dangerlevel) : '');
        data[epoch + '-dangerlevel-inverse'] = 100 - data[epoch + '-dangerlevel'];
    }

    var total = killed + lost;
    data[epoch + '-eff'] = (total > 0 ? 100 * (killed / (total)) : '');

    data[epoch + '-solopct'] = (solokills > 0 && solokills > -1 ? Math.round(100 * (solokills / killed)) : 0);
    data[epoch + '-solopct-inverse'] = 100 - data[epoch + '-solopct'];

    var k = (killed == 0 ? 0 : kisk / killed);
    var l = (lost == 0 ? 0 : lisk / lost);
    var total = k + l;
    data[epoch + '-zscore'] = (total > 0 ? 100 * (k / (total)) : '');

    data[epoch + '-avg-inv-cnt'] = (killed > 0 ? (get(result, epoch, 'inv_killed') / killed) : '')
}

function get(result, part1, part2) {
    if (result != undefined && result[part1] != undefined && result[part1][part2] != undefined) return result[part1][part2];
    return '';
}

module.exports = getData;