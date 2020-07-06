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

        //// Consider all kills
        //delete match['stats'];
        fquery = await this.facet_query(app, collection, match);
        this.apply(record, epoch, fquery, true, 'groups');
        this.apply(record, epoch, fquery, true, 'labels');
        this.apply(record, epoch, fquery, true, 'months');
        //this.applyTop10(record, epoch, fquery, true);

        record[epoch].last_sequence = max;

        var set = {};
        set[epoch] = record[epoch];

        await app.db.statistics.updateOne({
            _id: record._id
        }, {
            $set: set
        });

        // Update the redis ranking
        const rnowkey = 'zkilljs:ranks:' + record.type + ':' + epoch;
        var killed = record[epoch].killed || 0;
        if (killed > 0) await app.redis.zadd(rnowkey, killed, record.id);
        else await app.redis.zrem(rnowkey, record.id);

        // announce that the stats have been updated
        await app.redis.sadd('zkilljs:stats:publish', redis_base);
    },

    apply: function (record, epoch, result, areKills, label) {
        let agg = result[label];

        var beforek = record[epoch].killed,
            beforel = record[epoch].lost;

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
        record[epoch]['danger_level'] = this.do_danger_calc(record[epoch]);
    },

    do_danger_calc: function (epoch) {
        if (epoch == null) return null;
        if (epoch.killed == 0) return 0;
        if (epoch.lost == 0) return 1;

        return epoch.killed / (epoch.killed + epoch.lost);
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
    }
}

module.exports = stats;