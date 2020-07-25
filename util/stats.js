'use strict';

const negatives = ['character_id', 'corporation_id', 'alliance_id', 'faction_id', 'item_id', 'group_id', 'category_id',
    'war_id'
];


const stats = {
    update_stat_record: async function (app, collection, epoch, record, match, max) {
        let fquery;

        if (negatives.includes(record.type)) {
            match['involved.' + record.type] = -1 * record.id;
            fquery = await this.facet_query(app, collection, match);

            this.apply(record, epoch, fquery, false, 'groups');
            this.apply(record, epoch, fquery, false, 'labels');
            this.apply(record, epoch, fquery, false, 'months');
            this.applyTop10(record, epoch, fquery, false);
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
        this.applyTop10(record, epoch, fquery, true);

        var killed = record[epoch].killed || 0;
        var lost = record[epoch].lost || 0;

        if (killed + lost == 0) {
            return null; // Nothing here, return nothing
        } else {
            var solokills;
            try {
                solokills = record[epoch]['labels']['solo']['killed'];
                if (solokills == undefined) solokills = 0;
            } catch (e) {
                solokills = 0;
            }
            var total = killed + lost;
            var eff = (total > 0 ? (100 * (killed / total)) : null);
            var avg_inv_cnt = (killed > 0 ? (record[epoch].inv_killed / killed) : null);
            var solo = (killed > 0 ? 100 * (solokills / killed) : null);
            var snuggly = (eff == null ? null : (100 - eff));
            var score = (eff == null || avg_inv_cnt == null) ? null : Math.max(0, (eff - Math.sqrt(snuggly) - Math.sqrt(avg_inv_cnt - 1)));

            record[epoch]['solo'] = solo;
            record[epoch]['eff'] = eff;
            record[epoch]['snuggly'] = snuggly;
            record[epoch]['avg_inv_cnt'] = avg_inv_cnt;
            record[epoch]['score'] = score;

            record[epoch].last_sequence = max;
        }

        try {
            return record[epoch];
        } finally {
            record = null;
        }
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
        agg = null;
    },

    applyTop10: function (record, epoch, result, areKills) {
        let agg = result.topisk;
        if (agg == undefined || agg.length == 0) return;

        let type = areKills ? 'killed' : 'lost';
        let key = 'top_' + type;
        if (record[epoch] == undefined) record[epoch] = {};
        if (record[epoch][key] == undefined) record[epoch][key] = [];
        if (!Array.isArray(record[epoch][key])) record[epoch][key] = [];
        let min = this.getMin(record[epoch][key]);
        let affected = false;

        let size = record[epoch][key].length;
        for (let row of agg) {
            row.total_value = (row.total_value || 0);
            if (row.total_value >= min) {
                delete row._id;
                record[epoch][key].push(row);
                affected = true;
            }
        }

        if (affected) {
            record[epoch][key].sort(function (a, b) {
                return b.total_value - a.total_value;
            });
            if (record[epoch][key].length > 10) record[epoch][key].length = 10;
        }

        agg = null;
    },

    getMin: function (arr) {
        if (arr.length == 0) return 0;
        let minValue = Number.MAX_VALUE;
        for (let i of arr) {
            minValue = Math.min(minValue, i.total_value);
        }
        return minValue;
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
                    'months': [{
                        $group: {
                            _id: {
                                '$add': [{
                                    '$multiply': ['$year', 100]
                                }, '$month']
                            },
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
            }, ], {
                allowDiskUse: true
            }).toArray();

            return result.length == 0 ? {} : result[0];
        } finally {
            app.fquery--;
        }
    },

    group: async function (app, collection, match, type) {

        const util = require('util');
        var retval = [];

        var agg = [{
            $match: match
        }, {
            $unwind: '$involved.' + type
        }, {
            $match: {
                ['involved.' + type]: {
                    $gt: 0
                }
            }
        }, {
            $group: {
                _id: '$involved.' + type,
                count: {
                    $sum: 1
                }
            }
        }, {
            $sort: {
                count: -1
            }
        }, {
            $limit: 10
        }];

        let result = await app.db[collection].aggregate(agg, {
            allowDiskUse: true
        });

        while (await result.hasNext()) {
            var row = await result.next();
            row[type] = row._id;
            delete row._id;
            retval.push(row);
        }
        return retval;
    },

    topISK: async function (app, collection, match, limit = 10) {

        const util = require('util');
        var retval = [];

        var agg = [{
                $match: match
            },
            {
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
                $limit: limit
            }
        ];

        return await app.db[collection].aggregate(agg, {
            allowDiskUse: true
        }).toArray();

        while (await result.hasNext()) {
            var row = await result.next();
            row[type] = row._id;
            delete row._id;
            retval.push(row);
        }
        return retval;
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
        if (epoch == undefined) throw 'Invalid epoch';
        var count;
        do {
            if (app.bailout == true) throw 'bailing!';
            count = await app.db.statistics.countDocuments({
                ['update_' + epoch]: true
            });
            if (count > 0) await app.sleep(1);
        } while (count > 0);
    }
}

module.exports = stats;
