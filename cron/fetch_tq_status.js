'use strict';

async function f(app) {
	var url = app.esi + '/status/';
	await app.util.assist.esi_limiter(app);
	let res = await app.phin(url);
	await app.util.assist.esi_result_handler(app, res);

	app.no_api = (res.statusCode == 420 || res.statusCode == 401);
	if (app.no_api) console.log("No API at this time.");
}

module.exports = f;