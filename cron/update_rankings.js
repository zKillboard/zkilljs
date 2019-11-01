'use strict';

async function f(app) {
    let now = Math.floor(Date.now() / 1000);
    let now_7 = now - (86400 * 7);
    let now_90 = now - (86400 * 90);

    let types = await app.db.information.distinct('type');
    types.sort();
    for (let type of types) {
        let ids = await app.db.killmails.distinct('involved.' + type, {
            epoch: {
                $gte: now_7
            }
        });
        for (let id of ids) {
            let match = {
                epoch: {
                    $gte: now_7
                }
            };
            match['involved.' + type] = id;
            console.log(match);
            let stats = await app.util.stats.facet_query(app, match);
            let kl = id > 0 ? 'killed' : 'lost';
            console.log(stats);
            console.log(type + ' ' + id);
            break;
        }

        break;
    }
}

async function facet_query(app, epoch, type, id) {
    let match = {
        epoch: {
            $gte: epoch
        }
    };
    //match['involved.' + type] = id;
    let result = await app.db.killmails.aggregate([{
        '$match': match
    }, {
        '$facet': {
            'all': [{
                $group: {
                    _id: null,
                    count: {
                        $sum: 1
                    },
                    isk: {
                        $sum: '$total_value'
                    },
                    inv: {
                        $sum: '$involved_cnt'
                    }
                }
            }],
            'groups': [{
                $unwind: '$involved.group_id'
            }, {
                $match: {
                    'involved.group_id': {
                        $lt: 0
                    }
                }
            }, {
                $group: {
                    _id: '$involved.group_id',
                    count: {
                        $sum: 1
                    },
                    isk: {
                        $sum: '$total_value'
                    },
                    inv: {
                        $sum: '$involved_cnt'
                    }
                }
            }],
            'labels': [{
                    $unwind: '$labels'
                }, {
                    $group: {
                        _id: '$labels',
                        count: {
                            $sum: 1
                        },
                        isk: {
                            $sum: '$total_value'
                        },
                        inv: {
                            $sum: '$involved_cnt'
                        }
                    }
                }

            ],
            'topisk': [{
                $project: {
                    killmail_id: 1,
                    total_value: 1
                }
            }, {
                $match: {
                    'total_value': {
                        $gt: 10000
                    }
                }
            }, {
                $sort: {
                    total_value: -1
                }
            }, {
                $limit: 10
            }]
        }
    }, ]).toArray();
    return result.length == 0 ? {} : result[0];
}

module.exports = f;