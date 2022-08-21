'use strict';

const limit_object = {};
function clean_limit_object() {
	console.log(limit_object);
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
let rate_limit = 0;
function doSetRateLimit() {
	let d = new Date();
	let current_time = (d.getHours() * 100) + d.getMinutes();
	let calc_rate_limit = esi_rate_intervals[Object.keys(esi_rate_intervals)[0]]; // initial default
	for (const [time, timed_rate_limit] of Object.entries(esi_rate_intervals)) {
		if (current_time >= time) calc_rate_limit = timed_rate_limit;
	}
	if (rate_limit != calc_rate_limit) console.log('Setting ESI rate limit per second to', calc_rate_limit);
	rate_limit = calc_rate_limit;
}
setInterval(doSetRateLimit, 1000);

const assist = {
	esi_result_handler: async function (app, res, url) {
		// TODO check headers for versioning header

		if (res.statusCode == 200 || res.statusCode == 304) {
            app.util.ztop.zincr(app, 'esi_success');
			return; // All is well
		}

		// console.error(res.statusCode, url);

		app.util.ztop.zincr(app, 'esi_error');
		app.util.ztop.zincr(app, 'esi_error_' + res.statusCode);
		if (res.headers['x-esi-error-limit-remain']) {
			app.esi_errors_remaining = parseInt(res.headers['x-esi-error-limit-remain']);
			if (app.esi_errors_remaining < 20) app.no_api = true;
		}

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
		}
	},

	clear_no_api: async function(app) {
		app.no_api = false;
	},

	get_rate_limit: function() {
		return rate_limit;
	},

	esi_limiter : async function (app) {
		app.rate_limit = rate_limit;
		return await app.util.assist.limit_per_second(app, this.get_rate_limit);
	},

	limit_per_second : async function (app, limit = 1) {
		let count, wait, second;
		let current_limit;
		do {
			const now = Date.now();
			second = Math.floor(now / 1000);
			const remaining_ms = 1000 - (now % 1000) + 1;

			count = (limit_object[second] || 0);
			current_limit = await this.check_limit(limit);
			if (count >= current_limit) await app.sleep(remaining_ms);

		} while (count >= current_limit);
		limit_object[second] = (limit_object[second] || 0) + 1;
	},

	check_limit: async function(limit) {
		if (typeof limit == 'function') return await limit();
		return limit;
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
	},

	fetch_tq_status: async function(app) {
		try {
			var url = process.env.esi_url + '/latest/status/';
			let res = await app.orig_phin({url: url, timeout: 5000});

			if (res.statusCode == 200) {
				var status = JSON.parse(res.body);
				var keys = Object.keys(status);
				for (let key of keys) {
					await app.redis.setex('tq:status:' + key, 3600, status[key]);
				}
				app.server_version = status.server_version;
				app.no_api = false;
			} else {
				app.no_api = true;
			}
		} catch (e) {
			console.log(e);
			console.log('API offline?');
			app.no_api = true;
		}
	}
}

module.exports = assist;