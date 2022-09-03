'use strict';

module.exports = {
	exec: f,
	interval: 5
}

let excessive_count = 0;

async function f(app) {
	let usage = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);
	if (usage < 2048) {
		excessive_count = 0;
	} else {
		excessive_count++;
	
		if (excessive_count >= 20) {
			await app.redis.setex("RESTART", 120, "true");
			console.log('Excessive memory usage. Bailing for a reset.');
		} else global.gc();
	}
}