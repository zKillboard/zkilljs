'use strict';

async function f(app) {
    await publish_key(app, 'statsfeed', 'zkilljs:stats:publish');
    await publish_key(app, 'toplistsfeed', 'zkilljs:toplists:publish');
}

async function publish_key(app, action, rediskey) {
    var copy = rediskey + '_copy';
    if (await app.redis.exists(rediskey) > 0) {
        await app.redis.rename(rediskey, copy);
        while (await app.redis.scard(copy) > 0) {
            if (app.bailout == true) return;

            var next = await app.redis.spop(copy);
            if (next == null) break;

            var json = JSON.parse(next);

            var base = '/' + json.type.replace('_id', '') + '/' + json.id;
            var pubkey = action + ':' + base;
            await app.redis.publish(pubkey, JSON.stringify({
                action: action,
                path: base
            }));
        }
    }
}

module.exports = f;