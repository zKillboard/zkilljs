'use strict';

module.exports = {
    exec: f,
    span: 1
}

let first_run = true;
let concurrent = 0;
let max_concurrent = 3;

async function f(app) {
    while (app.zinitialized != true) await app.sleep(100);
    if (app.bailout == true) return;

    if (process.env.fetch_dailies != 'true') return;

    let now = Math.floor(Date.now() / 1000);
    let today = now - (now % 86400);
    let todaysKey = "zkb:daily_fetched:" + today;

    if (await app.redis.get(todaysKey) != "true" && await app.redis.scard("zkb:dailies") == 0) {        
        console.log("Populating dailies");
        let res = await app.phin('https://zkillboard.com/api/history/totals.json');
        let json = JSON.parse(res.body);
        for (const [key, value] of Object.entries(json)) {
            if (app.bailout) return;
            // Don't add it if the counts haven't been altered... 
            let currentCount = await app.redis.hget("zkb:dailies_count", key);
            if (parseInt(await app.redis.hget("zkb:dailies_lastcount", key)) == currentCount) continue;

            await app.redis.sadd("zkb:dailies", key);
            await app.redis.hset("zkb:dailies_count", key, value);
        }
        await app.redis.setex(todaysKey, 86400, "true");
    }

    let members = await app.redis.smembers("zkb:dailies");
    members.sort();

    while (await app.redis.scard("zkb:dailies") > 0) {
        if (app.bailout || app.dbstats.total > 25000) break;

        let key = members.pop();

        let currentCount = await app.redis.hget("zkb:dailies_count", key);
        if (parseInt(await app.redis.hget("zkb:dailies_lastcount", key)) == currentCount) {
            await app.redis.srem("zkb:dailies", key);
            continue;
        }

        while (app.bailout != true && concurrent >= max_concurrent) await app.sleep(1000);

        concurrent++;
        doImport(app, key);
    }
}

async function doImport(app, key) {
    try {
        if (app.bailout) return;

        let res = await app.phin('https://zkillboard.com/api/history/' + key + '.json');
        if (res.statusCode == 200) {
            try {
                let inserts = [];
                let added = 0;
                let json = JSON.parse(res.body);

                let entries = Object.entries(JSON.parse(res.body));
                for (let [id, hash] of entries) {
                    id = parseInt(id);
                    if (await app.db.killhashes.countDocuments({killmail_id: id, hash: hash}) == 0) {
                        inserts.push({killmail_id: parseInt(id), hash: hash, status: 'pending'});
                    }
                }

                if (inserts.length > 0) {
                    if (app.bailout) return 0;
                    let insert_res = await app.db.killhashes.insertMany(inserts, {ordered: false});
                    added = insert_res.insertedCount;
                    app.util.ztop.zincr(app, 'killmail_add_dailies', added);
                }

                await app.redis.hset("zkb:dailies_lastcount", key, entries.length);
                await app.redis.srem("zkb:dailies", key);

                if (added > 0) console.log('fetch_dailies', key, 'added', added, 'killmails');
                return added;
            } catch (e) {
                console.log('https://zkillboard.com/api/history/' + key + '.json', e.message);
                console.log(e);
                await app.sleep(10000);
                return 0;
            }
        }
    } catch (e) {
        console.log(e);
    } finally {
        concurrent--;
    }
}