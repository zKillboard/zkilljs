const app = require('fundamen')('www');
async function f(app) {
	app = await app;
	await app.redis.set('www:status:server_started', app.server_started);	
	setInterval(function() { memUsage(app); }, 5000);
}
f(app);

async function memUsage(app) {
    let usage = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024).toString() + 'MB';
    await app.redis.setex('zkb:www:memusage', 300, usage);
};