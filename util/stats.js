'use strict';

const stats = {
    update_stat_record: async function (app, record, match) {
        let fquery;
        if (record.type != 'label') {
            match['involved.' + record.type] = -1 * record.id;
            fquery = await this.facet_query(app, match);

            this.apply(record, fquery, false, 'groups');
            this.apply(record, fquery, false, 'labels');
            this.apply(record, fquery, false, 'months');
            this.applyTop10(record, fquery, false);
        }

        if (record.type == 'label') {
            match['labels'] = record.id;
        } else {
            match['involved.' + record.type] = record.id;
        }
        delete match['stats'];
        fquery = await this.facet_query(app, match);
        this.apply(record, fquery, true, 'groups');
        this.apply(record, fquery, true, 'labels');
        this.apply(record, fquery, true, 'months');
        this.applyTop10(record, fquery, true);

        record.last_sequence = record.sequence;
        record.update = false;

        await app.db.statistics.updateOne({
            _id: record._id,
            sequence: record.sequence
        }, {
            $set: record
        });
        await app.redis.publish(['stats', record.type, record.id].join(':'), "update");
    },

    apply: function (record, result, areKills, label) {
        let agg = result[label];
        for (let row of agg) {
            let id = (label == 'groups' ? Math.abs(row._id) : row._id);
            let type = areKills ? 'killed' : 'lost';

            if (record[label] == undefined) record[label] = {};
            if (record[label][id] == undefined) record[label][id] = {};
            record[label][id][type] = (record[label][id][type] || 0) + row.count;
            record[label][id]['isk_' + type] = (record[label][id]['isk_' + type] || 0) + row.isk;
            record[label][id]['inv_' + type] = (record[label][id]['inv_' + type] || 0) + row.inv;

            if (label == 'groups') {
                // Increment the record stats too
                record[type] = (record[type] || 0) + row.count;
                record['isk_' + type] = (record['isk_' + type] || 0) + row.isk;
                record['inv_' + type] = (record['inv_' + type] || 0) + row.inv;
            }
        }
    },

    applyTop10: function (record, result, areKills) {
        let agg = result.topisk;
        if (agg == undefined || agg.length == 0) return;

        let type = areKills ? 'killed' : 'lost';
        let key = 'top_' + type;
        if (record[key] == undefined) record[key] = {};
        let mins = this.getMins(record[key]);
        let affected = false;

        let size = Object.keys(record[key]).length;
        for (let row of agg) {
            if (size < 10 || row.total_value > mins.value) {
                record[key][row.killmail_id] = row.total_value;
                affected = true;
            }
        }

        if (affected) {
            size = Object.keys(record[key]).length;
            while (size > 10) {
                mins = this.getMins(record[key]);

                delete record[key][mins.key];
                size = Object.keys(record[key]).length;
            }
        } else {
            delete record[key]; // Don't save it to db since nothing changed
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

    facet_query: async function (app, match) {
        let result = await app.db.killmails.aggregate([{
            '$match': match
        }, {
            '$facet': {
                'totals': [{
                    $group : {
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
                            '$concat': [{
                                $toString: '$year'
                            }, '-', {
                                $toString: '$month'
                            }]
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
        }, ]).toArray();
        return result.length == 0 ? {} : result[0];
    }
}

module.exports = stats;