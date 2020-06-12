'use strict';

async function f(app) {
    var to_publish = await app.redis.smembers('zkilljs:stats:publish');
    for (var each of to_publish) {
        var record = await app.db.statistics.findOne(JSON.parse(each));
        if (record == null) {
        	await app.redis.srem('zkilljs:stats:publish', each);
        	continue;
        }

		if (record.update_alltime == false && record.update_recent == false && record.update_week == false) {
            var base = '/' + record.type.replace('_id', '') + '/' + record.id;
            var pubkey = 'statsfeed:' + base;
            await app.redis.publish(pubkey, JSON.stringify({
                action: 'statsfeed',
                path: base
            }));
            await app.redis.srem('zkilljs:stats:publish', each);
        }
    }
}

module.exports = f;