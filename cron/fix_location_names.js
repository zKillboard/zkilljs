'use strict';

module.exports = {
	exec: f,
	span: 3600
}

async function f(app) {
	while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

	let iterator = await app.db.information.find({type: 'location_id'}).batchSize(100);
	while (await iterator.hasNext()) {
		if (app.bailout) return;
		let location = await iterator.next();
		let stargate = await app.db.information.findOne({type: 'stargate_id', id: location.id})
		if (stargate != null && location.name != stargate.name) {
			await app.db.information.updateOne({_id: location._id}, {$set: {name: stargate.name}});
			if (stargate.name.indexOf('stargate_id') == -1) console.log('Corrected location_id', location.id, 'name to', stargate.name);
		}
	}
}