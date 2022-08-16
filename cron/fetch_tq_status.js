'use strict';

module.exports = {
    exec: f,
    span: 60
}

async function f(app) {
	while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
	
	try {
		var url = process.env.esi_url + '/latest/status/';
		let res = await app.phin({url: url, timeout: 5000});

		var status = JSON.parse(res.body);
		var keys = Object.keys(status);
		for (let key of keys) {
			await app.redis.setex('tq:status:' + key, 3600, status[key]);
		}

		app.no_api = (res.statusCode == 420 || res.statusCode == 401);
		if (app.no_api) console.log("No API at this time.");
	} catch (e) {
		console.log('API offline?');
		app.no_api = true;
	}
}