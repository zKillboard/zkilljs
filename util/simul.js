'use strict';

const concurrents = {};
const row_ids = {};

module.exports = {
	go: async function(app, name, collection, query, exec, exec_condition = returnTrue, max_concurrent = 1, max_wait_interval = 1000, min_wait_interval = 1, self_exec = false) {
		let total_exec_calls = 0;
		try {
			if (concurrents[name] == undefined) concurrents[name] = 0;

			if (await exec_condition(app) === true) {
				const iterator = collection.find(query);
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
	if (max_concurrent > 0) max_concurrent--;
	while (concurrents[name] > max_concurrent) await app.sleep(min_wait_interval);
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
	console.log('default'); 
	return true;
}