'use strict';

async function f(app) {
    if (await app.db.killhashes.countDocuments() > 2000000) return;

    if (await app.redis.scard("zkb:dailies") == 0) {
        let res = await app.phin('https://zkillboard.com/api/history/totals.json');
        let json = JSON.parse(res.body);
        for (const [key, value] of Object.entries(json)) {
            await app.redis.sadd("zkb:dailies", key);
        }
    }

    let key = await app.redis.spop("zkb:dailies");
    console.log(key);

    let res = await app.phin('https://zkillboard.com/api/history/' + key + '.json');
    let kms = JSON.parse(res.body);
    for (const [id, hash] of Object.entries(JSON.parse(res.body))) {
        await app.util.killmails.add(app, parseInt(id), hash);
    }
}

module.exports = f;