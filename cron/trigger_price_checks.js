'use strict';

async function f(app) {
	let todays_price_key = app.util.price.get_todays_price_key();

	// var result = await app.db.prices.updateOne({last_fetched: {$ne: todays_price_key}}, {$set: {waiting: true}});
}

module.exports = f;