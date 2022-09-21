'use strict';

module.exports = {
	exec: f,
	span: 86400,
	offset: -7200
}

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

	let res = await app.phin(process.env.esi_url + '/v1/insurance/prices/');
	if (res.statusCode != 200) throw 'Unable to fetch insurance';

	let body = JSON.parse(res.body);
	let epoch = app.now(86400);

	for (let row of body) {
		let do_insert = false;
		let insert = {};
		for (let level of row.levels) {
			if (level.cost == 0 || level.payout == 0) continue;
			insert[level.name] = {cost: level.cost, payout: level.payout};
			do_insert = true;
		}
		if (do_insert == false) continue;
		insert.type_id = parseInt(row.type_id);
		insert.epoch = epoch;

		await app.db.insurance.updateOne({type_id: insert.type_id, epoch: insert.epoch}, {$set: {insert}}, {upsert: true});
	}
}