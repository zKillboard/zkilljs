'use strict';

const limit_object = {};
function clean_limit_object() {
	const now = Math.floor(Date.now() / 1000);
	for (const key of Object.keys(limit_object)) {
		if (key < now) delete limit_object[key];
	}
}
setInterval(clean_limit_object, 5000);

// Per CCP Explorer, respect these rate limits
const esi_rate_intervals = {
	0 	 : 20, 	// 00:00am UTC
	800  : 10, 	// 08:00am UTC
	1030 : 0, 	// 10:30am UTC
	1130 : 10, 	// 11:30am UTC
	1800 : 5 	// 06:00pm UTC
}

const assist = {
	esi_result_handler: async function (app, res, url) {
		// TODO check headers for versioning header

		if (res.statusCode == 200 || res.statusCode == 304) {
            app.util.ztop.zincr(app, 'esi_success');
			return; // All is well
		}

		app.util.ztop.zincr(app, 'esi_error');
		console.log('ESI ERROR', res.statusCode, url);

		await app.sleep(1000); // pause on any and all errors
		switch (res.statusCode) {
	        case 401:
	            if (app.no_api == false) {
	                app.no_api = true;
	                console.log("http code 401 received, we've been banned?");
	            }            
	            break;
	        case 420:
	            if (app.no_api == false) {
	                app.no_api = true;
	                setTimeout(function() { app.util.assist.clear_no_api(app);}, 61000);
	                console.log("420'ed");
	            }
	            break;
	        case 500:
	            console.log('500 received');
	            break;
	        case 404:
	        case 502:
	        case 503:
	        case 504:
	            break; // Ignore, code should try again later
		}
	},

	clear_no_api: async function(app) {
		app.no_api = false;
	},

	esi_limiter : async function (app) {
		let d = new Date();
		let now = d.getHours() * 100 + d.getMinutes();
		let rate_limit = 1;
		for (const [time, timed_rate_limit] of Object.entries(esi_rate_intervals)) {
			if (now <= time) rate_limit = timed_rate_limit;
		}

		return await app.util.assist.limit_per_second(app, rate_limit);
	},

	limit_per_second : async function (app, limit = 1) {
		let count, wait, second;
		do {
			const now = Date.now();
			second = Math.floor(now / 1000);
			const remaining_ms = 1000 - (now % 1000) + 1;

			count = (limit_object[second] || 0);
			if (count >= limit) await app.sleep(remaining_ms);

		} while (count >= limit);
		limit_object[second] = (limit_object[second] || 0) + 1;
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
	},

	hasMinimum: async function(collection, query, min) {
	    var cursor = await collection.find(query).limit((min + 3));
	    try {
	        var count = 0;
	        while (await cursor.hasNext()) {
	            await cursor.next(); // throw it away
	            count++;
	            if (count >= min) return true;
	        }
	    }  finally {
	        collection = null;
	        cursor = null;
	    }
	    return false;
	},

	continue_simul_go: function(app) { 
    	return app.bailout !== true;
	}
}

module.exports = assist;