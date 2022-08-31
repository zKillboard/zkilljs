'use strict';

const concurrents = {};
const row_ids = {};

let limit = {};

module.exports = {
	go: async function(app, name, collection, query, exec, exec_condition = returnTrue, max_concurrent = 1, max_wait_interval = 1000, min_wait_interval = 1, self_exec = false) {
		let total_exec_calls = 0;
		if (limit[name] == undefined) limit[name] = 1000000;
		try {
			if (concurrents[name] == undefined) concurrents[name] = 0;

			if (await exec_condition(app) === true) {
				let iterator = (query.find != undefined ? collection.find(query.find) : collection.find(query));
				if (query.sort != undefined) iterator = iterator.sort(query.sort).limit(limit[name]);
				iterator = await iterator;

				while (await iterator.hasNext()) {
					await waitForConcurrents(app, name, min_wait_interval, max_concurrent); 
					if (await exec_condition(app) === false) break;

					let row = await iterator.next();
					let row_id = row._id.toString();
					if (row_ids[row_id] === true) continue;

					row_ids[row_id] = true;
					concurrents[name]++;
					doExec(app, name, exec, row, row_id);
					total_exec_calls++;
				}
			}
		} catch (e) {
			if (e.code == 292) {
				limit[name] = Math.ceil(limit[name] * 0.9) + 1;
				return console.log('Adjusted sort limit to ', limit[name], 'for', name);
			}
			console.error('simul.go error within', name);
			console.error(e);
		} finally {
			// we're done, go again if self_exec is true
			if (self_exec === true) {
				// pause between executions
				await apps.sleep((total_exec_calls > 0 ? min_wait_interval : max_wait_interval));
				this.simul(app, name, collection, query, exec_condition, max_concurrent, max_wait_interval, min_wait_interval);
			}
		}
	}
}

async function waitForConcurrents(app, name, min_wait_interval, max_concurrent) {
	let max = max_concurrent;
	if (typeof max_concurrent == 'function') max = await max_concurrent(app);
	if (max > 1) max--;
	while (concurrents[name] > max) await app.sleep(min_wait_interval);
}

async function doExec(app, name, exec, row, row_id) {
	try {
		// not sure how row could be null if it matched a query, but it has happened
		if (row != null) await exec(app, row);
	} finally {
		concurrents[name]--;
		delete row_ids[row_id];
	}
}

function returnTrue() {
	return true;
}