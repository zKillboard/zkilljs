'use strict';

// if record agg = true then do not calculate, mark killmail as next aggregate down
// if record is daily, calculate no matter what, mark aggregate up with calc = true

async function f(app) {
    if (await app.db.killhashes.countDocuments({
            status: 'fetched'
        }) > 100) return;

    let killhashes = await app.db.killhashes.find({
        status: 'parsed'
    }).sort({
        killmail_id: 1
    }).limit(1000).toArray();

    let promises = [];
    for (let killhash of killhashes) {
        await app.db.killhashes.updateOne(killhash, {
            $set: {
                status: 'applying_stats'
            }
        });
        promises.push(prepStats(app, killhash));
    }
    await app.waitfor(promises);

    if (promises.length < 100) await update_stats(app);
}

async function prepStats(app, killhash) {
    let killmail = await app.db.killmails.findOne({
        killmail_id: killhash.killmail_id
    });

    let keys = Object.keys(killmail.involved);
    for (let i = 0; i < keys.length; i++) {
        let type = keys[i];
        let values = killmail.involved[type];
        for (let j = 0; j < values.length; j++) {
            let id = values[j];
            await addKM(app, killmail, type, id, "alltime");
        }
        for (let j = 0; j < killmail.labels.length; j++) {
            await addKM(app, killmail, 'label', killmail.labels[j], "alltime");
        }
    }

    await app.db.killhashes.updateOne({
        _id: killhash._id
    }, {
        $set: {
            status: 'done'
        }
    });
}

async function addKM(app, killmail, type, id, span) {
    if (typeof id != 'string') id = Math.abs(id);
    let key = 'zkb:stat_insert:' + type + ':' + id;
    try {
        if (await app.redis.get(key) != "true") {
            await app.db.statistics.insertOne({
                type: type,
                id: id,
                span: 'alltime'
            });
        }
    } catch (e) {
        if (e.code != 11000) { // ignore duplicate key error
            console.log(e);
            return;
        }
    }
    await app.redis.setex(key, 60, "true");
    await app.db.statistics.updateOne({
        type: type,
        id: id,
        span: 'alltime'
    }, {
        $set: {
            update: true,
            sequence: killmail.sequence
        },
    });
}

const nextAgg = {
    'alltime': 'year',
    'year': 'month',
    'month': 'day'
};

async function update_stats(app) {
    let records = await app.db.statistics.find({
        update: true
        /*type: 'label',
        id: 'solo',
        span: 'alltime'*/
    }).limit(100).toArray();

    let promises = [];
    for (let record of records) {
        promises.push(update_stat_record(app, record));
    }
    await app.waitfor(promises);

    return records.length;
}

async function update_stat_record(app, record) {
    let match = {
        sequence: {
            '$gt': (record.last_sequence || 0),
            '$lte': record.sequence
        },
        stats: true,
    };
    //console.log(record.type, record.id);

    let fquery;
    if (record.type != 'label') {
        match['involved.' + record.type] = -1 * record.id;
        fquery = await facet_query(app, match);

        apply(record, fquery, false, 'groups');
        apply(record, fquery, false, 'labels');
        apply(record, fquery, false, 'months');
        applyTop10(record, fquery, false);
    }

    if (record.type == 'label') {
        match['labels'] = record.id;
    } else {
        match['involved.' + record.type] = record.id;
    }
    delete match['stats'];
    fquery = await facet_query(app, match);
    apply(record, fquery, true, 'groups');
    apply(record, fquery, true, 'labels');
    apply(record, fquery, true, 'months');
    applyTop10(record, fquery, true);

    record.last_sequence = record.sequence;
    record.update = false;

    await app.db.statistics.updateOne({
        _id: record._id,
        sequence: record.sequence
    }, {
        $set: record
    });
    await app.redis.publish(['stats', record.type, record.id].join(':'), "update");
}

function apply(record, result, areKills, label) {
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
}

function applyTop10(record, result, areKills) {
    let agg = result.topisk;
    if (agg == undefined || agg.length == 0) return;

    let type = areKills ? 'killed' : 'lost';
    let key = 'top_' + type;
    if (record[key] == undefined) record[key] = {};
    let mins = getMins(record[key]);
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
            mins = getMins(record[key]);

            delete record[key][mins.key];
            size = Object.keys(record[key]).length;
        }
    } else {
        delete record[key]; // Don't save it to db since nothing changed
    }
}

function getMins(arr) {
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
}

async function facet_query(app, match) {
    let result = await app.db.killmails.aggregate([{
        '$match': match
    }, {
        '$facet': {
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

module.exports = f;