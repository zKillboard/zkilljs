'use strict';

module.exports = {
    exec: f,
    span: 5
}


async function f(app) {
	while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

	const count = await app.db.prices.countDocuments({waiting: true});
	if (count > 0) return;
	
	let todays_price_key = app.util.price.get_todays_price_key();
	await app.db.prices.updateOne({last_fetched: {$ne: todays_price_key}}, {$set: {waiting: true}});
}