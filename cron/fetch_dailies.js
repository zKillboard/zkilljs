'use strict';

module.exports = {
    exec: f,
    span: 1
}

let first_run = true;
let concurrent = 0;

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

    if (concurrent > 0) return; // we need to let what is running finish to prevent conflicts
    let members = await app.redis.smembers("zkb:dailies");
    members.sort();

    let added = 0;
    while (await app.redis.scard("zkb:dailies") > 0) {
        if (app.bailout || app.dbstats.total > 10000) break;

        let key = members.pop();

        let currentCount = await app.redis.hget("zkb:dailies_count", key);
        if (parseInt(await app.redis.hget("zkb:dailies_lastcount", key)) == currentCount) {
            await app.redis.srem("zkb:dailies", key);
            continue;
        }

        while (concurrent >= 5) await app.sleep(1000);

        concurrent++;
        doImport(app, key);
    }
    while (concurrent > 0) await app.sleep(1000);
}

async function doImport(app, key) {
    try {
        let res = await app.phin('https://zkillboard.com/api/history/' + key + '.json');
        if (res.statusCode == 200) {
            try {
                let added = 0;
                let total = 0;
                for (const [id, hash] of Object.entries(JSON.parse(res.body))) {
                    if (app.bailout) return;

                    let is_new = await app.util.killmails.add(app, parseInt(id), hash);
                    added += is_new;
                    total++;
                    if (is_new > 0) {
                        app.util.ztop.zincr(app, 'killmail_add_dailies');
                    }
                }

                await app.redis.hset("zkb:dailies_lastcount", key, total);
                await app.redis.srem("zkb:dailies", key);

                if (added > 0) console.log('fetch_dailies', key, 'added', added, 'killmails');
                return added;
            } catch (e) {
                console.log('https://zkillboard.com/api/history/' + key + '.json', e.message);
                await app.sleep(10000);
                return;
            }
        }
    } catch (e) {
        console.log(e);
    } finally {
        concurrent--;
    }
}