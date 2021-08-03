'use strict';

async function f(app) {
	let todays_price_key = app.util.price.get_todays_price_key();

	let cursor = app.db.prices.find();
	while (await cursor.hasNext()) {
		// Iterate over the collection slowly to allow price checks to happen
		// without causing mail parses to come to a complete stop
		while (!app.bailout && await app.db.prices.countDocuments({waiting: true}) > 3) await app.sleep(250);
		if (app.bailout) break;

		let row = await cursor.next();
		if (row.todays_price_key != todays_price_key) {
			await app.db.prices.updateOne({_id: row._id}, {$set: {waiting: true}});
		}
	}
	// await app.db.prices.updateMany({last_fetched: {'$ne': todays_price_key}}, {$set: {waiting: true}}, {multi: true});
}

module.exports = f;