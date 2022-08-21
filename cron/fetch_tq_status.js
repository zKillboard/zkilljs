'use strict';

module.exports = {
    exec: f,
    span: 60
}

async function f(app) {
	while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
	
	await app.util.assist.fetch_tq_status(app);
}