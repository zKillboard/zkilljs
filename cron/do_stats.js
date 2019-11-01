'use strict';

// if record agg = true then do not calculate, mark killmail as next aggregate down
// if record is daily, calculate no matter what, mark aggregate up with calc = true

async function f(app) {
    if (await app.redis.get("zkb:no_stats") == "true") return;

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
    }).limit(100).toArray();

    let promises = [];
    for (let record of records) {
        let match = {
            sequence: {
                '$gt': (record.last_sequence || 0),
                '$lte': record.sequence
            },
            stats: true,
        };
        promises.push(app.util.stats.update_stat_record(app, record, match));
    }
    await app.waitfor(promises);

    return records.length;
}



module.exports = f;