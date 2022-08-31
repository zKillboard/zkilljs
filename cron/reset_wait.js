'use strict';

module.exports = {
    exec: f,
    span: 5
}

let batchsize = 100000;

async function f(app) {
    if (app.bailout != true && app.zinitialized != true) return;

    if (app.dbstats.total < 10 && app.dbstats.stats_total < 100) {
        let usage = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);
        if (usage >= 1000) global.gc();

        console.log('another', batchsize);
    	let iterator = await app.db.killhashes.find({status: 'wait'}).sort({killmail_id: -1}).limit(batchsize).project({_id: 1});
    	while (app.bailout != true && await iterator.hasNext()) {
    		let row = await iterator.next();
    		await app.db.killhashes.updateOne({_id: row._id}, {$set: {status: 'pending'}});
    	}
    }
}