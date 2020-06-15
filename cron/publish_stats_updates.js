'use strict';

async function f(app) {
    while (true) {
        if (app.bailout == true) return;

        var next = await app.redis.spop('zkilljs:stats:publish');
        if (next == null) return;

        var json = JSON.parse(next);

        var base = '/' + json.type.replace('_id', '') + '/' + json.id;
        var pubkey = 'statsfeed:' + base;
        await app.redis.publish(pubkey, JSON.stringify({
            action: 'statsfeed',
            path: base
        }));
    }
}

module.exports = f;