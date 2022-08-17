'use strict';

const limit_object = {};
function clean_limit_object() {
	const now = Math.floor(Date.now() / 1000);
	for (const key of Object.keys(limit_object)) {
		if (key < now) delete limit_object[key];
	}
}
setInterval(clean_limit_object, 5000);

const assist = {
	esi_result_handler: async function (app, res) {
		// TODO check headers for versioning header

		if (res.statusCode == 200 || res.statusCode == 304) {
            app.util.ztop.zincr(app, 'esi_success');
			return; // All is well
		}

		app.util.ztop.zincr(app, 'esi_error');

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
	            console.log('500 received');
	            break;
	        case 404:
	        case 502:
	        case 503:
	        case 504:
	            break; // Ignore, code should try again later
		}
	},

	esi_limiter : async function (app) {
		return await app.util.assist.limit_per_second(app, (process.env.esi_limit_per_second || 10));
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
	}
}

module.exports = assist;
