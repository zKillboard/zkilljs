'use strict';

async function f(app) {
    if (app.no_fetch_dailies) return;

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

    let added = 0;
    while (await app.redis.scard("zkb:dailies") > 0 && added < 50000) {
        let members = await app.redis.smembers("zkb:dailies");
        members.sort().reverse();
        let key = members[0];

        let currentCount = await app.redis.hget("zkb:dailies_count", key);
        if (parseInt(await app.redis.hget("zkb:dailies_lastcount", key)) == currentCount) {
            await app.redis.srem("zkb:dailies", key);
            continue;
        }
        console.log('Fetching daily: ' + key);

        let res = await app.phin('https://zkillboard.com/api/history/' + key + '.json');
        if (res.statusCode == 200) {
            for (const [id, hash] of Object.entries(JSON.parse(res.body))) {
                if (app.bailout) return;
                added += await app.util.killmails.add(app, parseInt(id), hash);
            }
        }
        await app.redis.hset("zkb:dailies_lastcount", key, currentCount);
        await app.redis.srem("zkb:dailies", key);
    }
    if (added > 0) console.log('fetch_dailies added ' + added + ' killmails');
}

module.exports = f;
