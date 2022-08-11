'use strict';

module.exports = {
    exec: f,
    span: 60
}

async function f(app) {
	var url = process.env.esi_url + '/latest/status/';
	await app.util.assist.esi_limiter(app);
	let res = await app.phin(url);
	await app.util.assist.esi_result_handler(app, res);

	var status = JSON.parse(res.body);
	var keys = Object.keys(status);
	for (let key of keys) {
		await app.redis.setex('tq:status:' + key, 3600, status[key]);
	}

	app.no_api = (res.statusCode == 420 || res.statusCode == 401);
	if (app.no_api) console.log("No API at this time.");
}