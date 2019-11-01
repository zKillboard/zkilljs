'use strict';

async function f(app) {
    let now = Math.floor(Date.now() / 1000);
    let today = now - (now % 86400);
    let todaysKey = "zkb:daily_fetched:" + today;

    if (await app.redis.get(todaysKey) != "true" && await app.redis.scard("zkb:dailies") == 0) {        
        console.log("Populating dailies");
        let res = await app.phin('https://zkillboard.com/api/history/totals.json');
        let json = JSON.parse(res.body);
        for (const [key, value] of Object.entries(json)) {
            await app.redis.sadd("zkb:dailies", key);
        }
        await app.redis.setex(todaysKey, 86400, "true");
    }

    let key = await app.redis.spop("zkb:dailies");
    if (key == undefined || key == null) return;
    console.log(key);

    let res = await app.phin('https://zkillboard.com/api/history/' + key + '.json');
    if (res.statusCode == 200) {
        for (const [id, hash] of Object.entries(JSON.parse(res.body))) {
            await app.util.killmails.add(app, parseInt(id), hash);
        }
    }
}

module.exports = f;