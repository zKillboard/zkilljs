'use strict';

module.exports = {
    exec: f,
    span: 86400,
    offset: 39660 // run during downtime
}

// the padding label will be applied to any ships that is the 5th or higher ship to have an equivalent padhash for a day

async function f(app) {
	while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

	try {
		app.padhash_checking = false;
		console.log('Padhash triggers activating...')
		let padding = await discover_years(app);
		if (padding > 0) await app.db.statistics.updateOne({type: 'label', id: 'id'}, {$set: {reset: true}});
	} finally {
		app.padhash_checking = false;
	}
}

async function discover_years(app) {
	let padding = 0;
	let years = (await app.db.killmails.distinct('year')).sort().reverse();
	for (let year of years) padding += await discover_months(app, year);
	return padding;
}

async function discover_months(app, year) {
	let padding = 0;
	let months = (await app.db.killmails.distinct('month', {year: year})).sort().reverse();
	for (let month of months) padding += await discover_days(app, year, month);
	return padding;
}

async function discover_days(app, year, month) {
	let padding = 0;
	let days = (await app.db.killmails.distinct('day', {year: year, month: month})).sort().reverse();
	for (let day of days) padding += await discover_padhashes(app, year, month, day);
	return padding;
}

async function discover_padhashes(app, year, month, day) {
	if (app.bailout) return;

	// Check padhash count for this day
	let count = await app.db.killmails.countDocuments({year: year, month: month, day: day, padhash: {$exists: true}});
	// Compare to what we've done previously
	let rkey = year + ':' + month + ':' + day;
	let previous_count = parseInt(await app.redis.hget('zkb:padmapcount', rkey) | 0);
	if (previous_count == count) return; // No need to check again

	let match = {
		year: year,
		month: month,
		day: day,
		padhash: {$exists: true, $ne: null},
		'involved.label': {$ne: 'padding'}
	};

	let result = await app.db.killmails.aggregate([
			{$match: match}, 
			{$group: {_id: "$padhash", count: {$sum: 1}}},
			{$match: {count: {$gt: 5}}}
		], 
		{allowDiskUse: true}).toArray();

	let padding = 0;
	for (let padhash of result) {
		if (padhash == 'not set') continue; // they're not set, ignore them
		match.padhash = padhash._id;
		let killmails = await app.db.killmails.find(match).batchSize(100);
		let count = 0;

		while (await killmails.hasNext()) {
			let killmail = await killmails.next();
			count++;
			if (count > 5) {
				if (killmail.involved.label.indexOf('nostats') == -1) { // if it has already been cleared and set to nostats, don't modify again
					padding++;
					let labels = new Set();
					add2Set(labels, killmail.involved.label);

					labels.delete('pvp');
					labels.add('nostats');
					labels.add('padding');

					let label = [... labels];

					await app.db.killmails.updateOne({killmail_id: killmail.killmail_id}, {$set: {stats: false, 'involved.label': label}});;
					await app.db.killmails_90.updateOne({killmail_id: killmail.killmail_id}, {$set: {stats: false, 'involved.label': label}});
					await app.db.killmails_7.updateOne({killmail_id: killmail.killmail_id}, {$set: {stats: false, 'involved.label': label}});
					
					// reset all entities on the mail
					for (const type of Object.keys(killmail.involved)) {
			            for (var id of killmail.involved[type]) {
			                id = (type == 'label' ? id : Math.abs(id));
			                await app.db.statistics.updateOne({type: type, id: id}, {$set: {reset: true}});
			            }
			        }
				}
			}
		}
	}
	if (padding > 0) console.log(year, month, day, 'has', padding.toLocaleString(), 'killmails marked as padding');
	await app.redis.hset('zkb:padmapcount', rkey, count);
	return padding;
}

function add2Set(set, arr) {
	for (let a of arr) {
		if (Array.isArray(a)) add2Set(set, a);
		else set.add(a);
	}
}