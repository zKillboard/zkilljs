'use strict';

async function f(app) {
	await app.db.datacache.remove({epoch : {$lt: app.now()}});
}

module.exports = f;