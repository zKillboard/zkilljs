'use strict';

const assist = {
	esi_result_handler: async function (app, res) {
		// TODO check headers for versioning header

		if (res.statusCode == 200 || res.statusCode == 304) {
            app.zincr('esi_fetched');
			return; // All is well
		}

		await app.zincr('esi_error');
		await app.zincr('esi_error_' + res.statusCode);
		await app.sleep(1000); // pause on any and all errors
		switch (res.statusCode) {
	        case 401:
	            if (app.no_api == false) {
	                app.no_api = true;
	                //setTimeout(function() { clear_no_api(app); }, 300000 + (Date.now() % 60000));
	                console.log("http code 401 received, we've been banned?");
	            }            
	            break;
	        case 420:
	            if (app.no_api == false) {
	                app.no_api = true;
	                setTimeout(function() {clear_no_api(app);}, 1000 + (Date.now() % 60000));
	                console.log("420'ed in information: " + row.type + " " + row.id);
	            }
	            break;
	        case 500:
	            console.log(row.type, row.id, '500 received');
	            break;
	        case 502:
	        case 503:
	        case 504:
	            break; // Ignore, code should try again later
		}
	},

	esi_limiter : async function (app) {
		return await app.util.assist.limit_per_second(app, 25);
	},

	limit_per_second : async function (app, limit) {
		var key = 'limiter:' + app.now();
		await app.redis.set(key, '0', 'NX', 'EX', 5);
		while (parseInt(await app.redis.get(key)) >= limit) await app.sleep(10);
		await app.redis.incrby(key, 1);
	},

	publish_key: async function (app, action, rediskey) {
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
}

module.exports = assist;
