'use strict';

module.exports = {
    exec: f,
    span: 5
}

let limit = 250000;
let high_stats_count = false;

async function f(app) {
    return;
    if (app.bailout != true && app.zinitialized != true) return;

    if (app.dbstats.total > 10 || app.dbstats.update_alltime > 100) return;

    console.log('another', limit);
	let iterator = await app.db.killhashes.find({status: 'wait'}).sort({killmail_id: -1}).limit(limit).batchSize(100).project({_id: 1});
	while (app.bailout != true && await iterator.hasNext()) {
		let row = await iterator.next();
		await app.db.killhashes.updateOne({_id: row._id}, {$set: {status: 'pending'}});
	}
    await iterator.close();
}

function usage() {
    let before = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);
    if (before < 3096) return;
    global.gc();
    let after = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);
    if (after < before) console.log('Cleaned up', (before - after), 'mb');
}
setInterval(usage, 15000);