'use strict';

async function f(app) {
	await app.db.datacache.deleteMany({epoch : {$lt: app.now()}});
}

module.exports = f;