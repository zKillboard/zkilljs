'use strict';

module.exports = {
    exec: f,
    span: 1
}

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

	await app.db.datacache.deleteMany({epoch : {$lt: app.now()}});
}