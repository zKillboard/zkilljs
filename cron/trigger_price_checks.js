'use strict';

async function f(app) {
	let todays_price_key = app.util.price.get_todays_price_key();
	await app.db.prices.updateMany({last_fetched: {'$ne': todays_price_key}}, {$set: {waiting: true}}, {multi: true});
}

module.exports = f;