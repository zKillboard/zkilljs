const app = require('fundamen')('www');
async function f(app) {
	app = await app;
	await app.redis.set('www:status:server_started', app.server_started);	
}
f(app);
