'use strict';

const negatives = ['character_id', 'corporation_id', 'alliance_id', 'faction_id', 'item_id', 'group_id', 'category_id',
    'war_id'
];


const stats = {
    update_stat_record: async function (app, collection, epoch, record, match, max) {
        let fquery;
        let redis_base = JSON.stringify({
            type: record.type,
            id: record.id
        });
        await app.redis.srem('zkilljs:stats:publish', redis_base);

        if (negatives.includes(record.type)) {
            match['involved.' + record.type] = -1 * record.id;
            fquery = await this.facet_query(app, collection, match);

            this.apply(record, epoch, fquery, false, 'groups');
            this.apply(record, epoch, fquery, false, 'labels');
            this.apply(record, epoch, fquery, false, 'months');
            //this.applyTop10(record, epoch, fquery, false);
        }

        if (record.type == 'label' & record.id == 'all') {
            // no match, we want all of the killmails
        } else if (record.type == 'label') {
            match['labels'] = record.id;
        } else {
            match['involved.' + record.type] = record.id;
        }

        fquery = await this.facet_query(app, collection, match);
        this.apply(record, epoch, fquery, true, 'groups');
        this.apply(record, epoch, fquery, true, 'labels');
        this.apply(record, epoch, fquery, true, 'months');
        //this.applyTop10(record, epoch, fquery, true);

        var solokills;
        try {
            solokills = record[epoch]['labels']['solo']['killed'];
            if (solokills == undefined) solokills = 0;
        } catch (e) {
            solokills = 0;
        }
        var killed = record[epoch].killed || 0;
        var lost = record[epoch].lost || 0;
        var total = killed + lost;
        var eff = (total > 0 ? (100 * (killed / total)) : null);
        var avg_inv_cnt = (killed > 0 ? (record[epoch].inv_killed / killed) : null);
        var solo = (killed > 0 ? 100 * (solokills / killed) : null);
        var snuggly = (eff == null ? null : (100 - eff));
        var score = (eff == null || avg_inv_cnt == null) ? null : Math.max(0, (eff - (snuggly / 2) - Math.sqrt(avg_inv_cnt - 1)));

        record[epoch]['solo'] = solo;
        record[epoch]['eff'] = eff;
        record[epoch]['snuggly'] = snuggly;
        record[epoch]['avg_inv_cnt'] = avg_inv_cnt;
        record[epoch]['score'] = score;

        record[epoch].last_sequence = max;

        var set = {};
        set[epoch] = record[epoch];

        await app.db.statistics.updateOne({
            _id: record._id
        }, {
            $set: set
        });

        // Update the redis ranking
        const redisRankKey = 'zkilljs:ranks:' + record.type + ':' + epoch;
        if (killed > 0) await app.redis.zadd(redisRankKey, killed, record.id);
        else await app.redis.zrem(redisRankKey, record.id);

        // announce that the stats have been updated
        await app.redis.sadd('zkilljs:stats:publish', redis_base);
    },

    apply: function (record, epoch, result, areKills, label) {
        let agg = result[label];

        for (let row of agg) {
            let id = (label == 'groups' ? Math.abs(row._id) : row._id);
            let type = areKills ? 'killed' : 'lost';

            if (record[epoch][label] == undefined) record[epoch][label] = {};
            if (record[epoch][label][id] == undefined) record[epoch][label][id] = {};
            record[epoch][label][id][type] = (record[epoch][label][id][type] || 0) + (row.count || 0)
            record[epoch][label][id]['isk_' + type] = (record[epoch][label][id]['isk_' + type] || 0) + (row.isk || 0)
            record[epoch][label][id]['inv_' + type] = (record[epoch][label][id]['inv_' + type] || 0) + (row.inv || 0)

            if (label == 'groups') {
                // Increment the group stats too
                record[epoch][type] = (record[epoch][type] || 0) + (row.count || 0);
                record[epoch]['isk_' + type] = (record[epoch]['isk_' + type] || 0) + (row.isk || 0);
                record[epoch]['inv_' + type] = (record[epoch]['inv_' + type] || 0) + (row.inv || 0);
            }
        }
    },

    applyTop10: function (record, epoch, result, areKills) {
        let agg = result.topisk;
        if (agg == undefined || agg.length == 0) return;

        let type = areKills ? 'killed' : 'lost';
        let key = 'top_' + type;
        if (record[epoch] == undefined) record[epoch] = {};
        if (record[epoch][key] == undefined) record[epoch][key] = {};
        let mins = this.getMins(record[epoch][key]);
        let affected = false;

        let size = Object.keys(record[epoch][key]).length;
        for (let row of agg) {
            row.total_value = (row.total_value || 0);
            if (size < 10 || row.total_value > mins.value) {
                record[epoch][key][row.killmail_id] = row.total_value;
                affected = true;
            }
        }

        if (affected) {
            size = Object.keys(record[epoch][key]).length;
            while (size > 10) {
                mins = this.getMins(record[epoch][key]);

                delete record[epoch][key][mins.key];
                size = Object.keys(record[epoch][key]).length;
            }
        } else {
            delete record[epoch][key]; // Don't save it to db since nothing changed
        }
    },

    getMins: function (arr) {
        let minKey = '';
        let minValue = Number.MAX_VALUE;
        let keys = Object.keys(arr);
        for (let i = 0; i < keys.length; i++) {
            if (arr[keys[i]] < minValue) {
                minKey = keys[i];
                minValue = arr[keys[i]];
            }
        }
        return {
            key: minKey,
            value: minValue
        };
    },

    facet_query: async function (app, collection, match) {
        //while (app.fquery >= 5) await app.sleep(1); // poor man's sempahore
        app.fquery++;

        try {
            let result = await app.db[collection].aggregate([{
                '$match': match
            }, {
                '$facet': {
                    'totals': [{
                        $group: {
                            _id: null,
                            count: {
                                $sum: {
                                    $cond: [{
                                        $eq: ['$purging', true]
                                    }, -1, 1]
                                }
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
                                $sum: {
                                    $cond: [{
                                        $eq: ['$purging', true]
                                    }, -1, 1]
                                }
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
                                    $sum: {
                                        $cond: [{
                                            $eq: ['$purging', true]
                                        }, -1, 1]
                                    }
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
                    'months': [{
                        $group: {
                            _id: {
                                '$add': [{
                                    '$multiply': ['$year', 100]
                                }, '$month']
                            },
                            count: {
                                $sum: {
                                    $cond: [{
                                        $eq: ['$purging', true]
                                    }, -1, 1]
                                }
                            },
                            isk: {
                                $sum: '$total_value'
                            },
                            inv: {


                                $sum: '$involved_cnt'
                            }
                        }
                    }],
                    /*'topisk': [{
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
                    }]*/
                }
            }, ], {
                allowDiskUse: true
            }).toArray();

            return result.length == 0 ? {} : result[0];
        } finally {
            app.fquery--;
        }
    },

    do_agg: async function (app, collection, aggregate, type) {
        let hint = {};
        if (type != 'label') {
            hint = "sequence_1_involved." + type + "_1";
            if (aggregate[0]['$match']['stats'] == true) hint = "stats_1_" + hint;
        }

        let result = await app.db[collection].aggregate(aggregate, {
            hint: hint
        }).toArray();

        return result;
    },

    wait_for_stats: async function (app, epoch) {
        var count;
        do {
            if (app.bailout == true) throw 'bailing!';
            await app.sleep(1);
            count = await app.db.statistics.countDocuments({
                ['update_' + epoch]: true
            });
        } while (count > 0);
    }
}

module.exports = stats;
