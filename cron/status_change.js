'use strict';

module.exports = {
    exec: f,
    span: 1
}

// Looks for any documents that have status set in the killmails collection,
// if found, applies the status to the applicable document in killhashes 
// and removes the status from the killmail document
async function f(app) {
	while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
	
	var result = await app.db.killmails.find({status: {'$exists': 1}});
	var row;
	while (await result.hasNext()) {
		row = await result.next();
		console.log(row.killmail_id);

		// Update the killhash status
		await app.db.killhashes.updateMany({killmail_id: row.killmail_id}, {'$set': {status: row.status}}, {multi: true});

		// Remove the status from the killmail document
		await app.db.killmails.updateMany({killmail_id: row.killmail_id}, {'$unset': {status: 1}}, {multi: true});
	}
}