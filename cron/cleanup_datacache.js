'use strict';

module.exports = {
    exec: f,
    span: 1
}

async function f(app) {
	await app.db.datacache.deleteMany({epoch : {$lt: app.now()}});
}