'use strict';

module.exports = {
    exec: f,
    span: 1
}

async function f(app) {
    if (process.env.fetch_dailies != 'true') return;
    while (app.zinitialized != true) await app.sleep(100);

    /*if (await app.db.statistics.countDocuments({update_alltime: true}) > 100000) {
        // let's get caught up here... 
        while (app.bailout !== true && await app.db.statistics.countDocuments({update_alltime: true}) > 0) await app.sleep(1000);
    }*/

    if (app.bailout) return;

    let now = app.now();
    let today = now - (now % 86400);
    let todaysKey = "zkilljs:daily_fetched:" + today;

    if (await app.redis.get(todaysKey) != "true" && await app.redis.scard("zkilljs:dailies") == 0) {        
        console.log("Populating dailies");
        let res = await app.phin('https://zkillboard.com/api/history/totals.json');
        let json = JSON.parse(res.body);
        for (const [key, value] of Object.entries(json)) {
            if (app.bailout) return;
            // Don't add it if the counts haven't been altered... 
            let currentCount = await app.redis.hget("zkilljs:dailies_count", key);
            if (parseInt(await app.redis.hget("zkilljs:dailies_lastcount", key)) == currentCount) continue;

            await app.redis.sadd("zkilljs:dailies", key);
            await app.redis.hset("zkilljs:dailies_count", key, value);
        }
        await app.redis.setex(todaysKey, 86400, "true");
    }

    let members = await app.redis.smembers("zkilljs:dailies");
    members.sort();
    let total = 0;
    const dailies_limit = (process.env.dailies_limit || 25000);

    while (await app.redis.scard("zkilljs:dailies") > 0) {
        if (app.bailout || (app.dbstats.total + total) > dailies_limit) break;

        let key = members.pop();

        let currentCount = await app.redis.hget("zkilljs:dailies_count", key);
        if (parseInt(await app.redis.hget("zkilljs:dailies_lastcount", key)) == currentCount) {
            await app.redis.srem("zkilljs:dailies", key);
            continue;
        }

        total += await doImport(app, key);
    }
}

async function doImport(app, key) {
    try {
        if (app.bailout) return;

        let res = await app.phin('https://zkillboard.com/api/history/' + key + '.json');
        let json, entries, size = 0;
        if (res.statusCode == 200) {
            json = JSON.parse(res.body);
            entries = Object.entries(JSON.parse(res.body));
            size = entries.length;
            try {
                let inserts = [];
                let added = 0;

                for (let [id, hash] of entries) {
                    id = parseInt(id);
                        inserts.push({killmail_id: parseInt(id), hash: hash, status: 'pending'});
                }

                if (inserts.length > 0) {
                    if (app.bailout) return 0;
                    let insert_res = await app.db.killhashes.insertMany(inserts, {ordered: false});
                    added = insert_res.insertedCount;
                    app.util.ztop.zincr(app, 'killmail_add_dailies', added);
                }

                await app.redis.hset("zkilljs:dailies_lastcount", key, size);
                await app.redis.srem("zkilljs:dailies", key);

                if (added > 0) console.log('fetch_dailies', key, 'added', added, 'killmails');
                return added;
            } catch (e) {
                if (e.code == 11000) { // duplicate key error, we can ignore it and move on
                    await app.redis.hset("zkilljs:dailies_lastcount", key, size);
                    await app.redis.srem("zkilljs:dailies", key);
                    return size;
                }
                console.log('https://zkillboard.com/api/history/' + key + '.json', e.message, e.code);
                console.log(e);
                await app.sleep(10000);
                return 0;
            }
        }
    } catch (e) {
        console.log(e);
    }
}