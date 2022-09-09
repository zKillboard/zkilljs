'use strict';

module.exports = {
	exec: f,
	span: 60
}

async function f(app) {
	while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

	let unnamed = [];

	let iterator = await app.db.information.find({type: 'location_id', name: null});
	while (await iterator.hasNext()) {
		let location = await iterator.next();
		let stargate = await app.db.information.findOne({type: 'stargate_id', id: location.id})
		if (stargate != null) {
			await app.db.information.updateOne({_id: location._id}, {$set: {name: stargate.name}});
			console.log('Corrected location_id name', location.id, 'to', stargate.name);
		} else unnamed.push(location.id);
	}

	if (unnamed.length > 0) console.log('Unable to correct name for', unnamed.length.toLocaleString(), 'locations');
}