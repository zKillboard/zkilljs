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
    if (result == undefined) return;
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
    data[epoch + '-solo-kills'] = (solokills > 0 ? solokills : '');

    data[epoch + '-kills'] = killed;
    data[epoch + '-isk-killed'] = kisk;
    data[epoch + '-rank'] = (rank != null ? rank + 1 : '');
    data[epoch + '-lost'] = lost;
    data[epoch + '-isk-lost'] = lisk;

    var dangerlevel = get(result, epoch, 'danger_level');
    if (isNaN(dangerlevel)) {
        data[epoch + '-dangerlevel'] = '';
        data[epoch + '-dangerlevel-bar'] = '';
        data[epoch + '-dangerlevel-inverse'] = '';
    } else {
        data[epoch + '-dangerlevel-bar'] = (dangerlevel != undefined && !isNaN(dangerlevel) ? Math.round(100 * dangerlevel) : 0);
        data[epoch + '-dangerlevel-inverse'] = 100 - data[epoch + '-dangerlevel'];
        data[epoch + '-dangerlevel'] = 100 - data[epoch + '-dangerlevel-bar'];
    }

    var total = killed + lost;
    var eff = (total > 0 ? (killed / (total)) : '');
    data[epoch + '-eff'] = (eff == '' ? '' : 100 * eff);

    data[epoch + '-solopct'] = (solokills > 0 && solokills > -1 ? Math.round(100 * (solokills / killed)) : '');
    data[epoch + '-solopct-bar'] = data[epoch + '-solopct'];
    data[epoch + '-solopct-inverse-bar'] = (killed > 0 ? 100 - data[epoch + '-solopct'] : '');

    var k = (killed == 0 ? 0 : kisk / killed);
    var l = (lost == 0 ? 0 : lisk / lost);
    var total = k + l;
    var avg_inv_cnt = (killed > 0 ? (get(result, epoch, 'inv_killed') / killed) : 0);
    data[epoch + '-avg-inv-cnt'] = (avg_inv_cnt == 0 ? '' : avg_inv_cnt);

    data[epoch + '-zscore'] = (killed > 0 ? 100 * (Math.min(1, (1 / Math.log10(Math.max(2, avg_inv_cnt)))) * Math.min(1, eff * 2) * (k / (total))) : '');
    //data[epoch + '-zscore'] = (killed > 0 ? 100 * (Math.min(1, (1 / Math.log2(Math.log2(Math.max(2, avg_inv_cnt))))) * Math.min(1, eff * 2) ) : '');
    //data[epoch + '-zscore'] = 100 * (eff * Math.log2(Math.log2(avg_inv_cnt + 1)));
}

function get(result, part1, part2) {
    if (result != undefined && result[part1] != undefined && result[part1][part2] != undefined) return result[part1][part2];
    return '';
}

module.exports = getData;