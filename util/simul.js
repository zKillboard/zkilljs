'use strict';

module.exports = {
	go: async function(app, name, collection, query, exec, exec_continue = true, max_concurrent = 1, max_wait_interval = 1000, min_wait_interval = 1) {
		const set = new Set();

		let iterator = (query.find != undefined ? collection.find(query.find) : collection.find(query));
		if (query.sort != undefined) iterator = iterator.sort(query.sort);
		iterator = await iterator.project({_id: 1}).batchSize(100);

		while (await iterator.hasNext()) {
			if (max_concurrent != 1) await waitForConcurrents(app, set, min_wait_interval, max_concurrent);
			if (exec_continue != true && await exec_continue(app) !== true) break;

			let row = await collection.findOne({_id: (await iterator.next())._id});
			
			const s = Symbol();
			set.add(s);
			doExec(app, set, s, exec, row, console.error);
		}
		if (iterator.close) await iterator.close();

		while (set.size > 0) await app.sleep(1);
	}
}

async function waitForConcurrents(app, set, min_wait_interval, max_concurrent) {
	let max = max_concurrent;
	if (typeof max_concurrent == 'function') max = await max_concurrent(app);
	if (max > 1) max--;
	while (set.size > max) await app.sleep(Math.max(1, min_wait_interval));
}

async function doExec(app, set, s, exec, row, err) {
	try {
		await exec(app, row);
	} catch(e) {
		err(e);
	} finally {
		set.delete(s);
	}
}