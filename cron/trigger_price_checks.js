'use strict';

async function f(app) {
	let todays_price_key = app.util.price.get_todays_price_key();

	let cursor = app.db.prices.find();
	while (await cursor.hasNext()) {
		if (app.bailout) break;
		let row = await cursor.next();

		if (row.last_fetched == todays_price_key) continue;

		// Iterate over the collection slowly to allow price checks to happen
		// without causing mail parses to come to a complete stop
		let count = 0;
		do {
			if (app.bailout) break;
			count = await app.db.prices.countDocuments({waiting: true});
		} while (!app.bailout && count > 3) await app.sleep(1000);

		await app.db.prices.updateOne({_id: row._id}, {$set: {waiting: true}});
	}
}

module.exports = f;