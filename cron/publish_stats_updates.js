'use strict';

async function f(app) {
    if (await app.redis.exists('zkilljs:stats:publish') > 0) {
        await app.redis.rename('zkilljs:stats:publish', 'zkilljs:stats:publish_copy');
        while (true) {
            if (app.bailout == true) return;

            var next = await app.redis.spop('zkilljs:stats:publish_copy');
            if (next == null) break;

            var json = JSON.parse(next);

            var base = '/' + json.type.replace('_id', '') + '/' + json.id;
            var pubkey = 'statsfeed:' + base;
            await app.redis.publish(pubkey, JSON.stringify({
                action: 'statsfeed',
                path: base,
                interval: 15
            }));
        }
    }
}

module.exports = f;