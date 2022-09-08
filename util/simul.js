'use strict';

module.exports = {
	go: async function(app, iterator, exec, exec_continue = true, max_concurrent = 1) {
		const set = new Set();

		while (await iterator.hasNext() && (exec_continue === true || await exec_continue(app) === true)) {
			while (set.size >= (typeof max_concurrent == 'function' ? await max_concurrent(app) : max_concurrent)) await app.sleep(1);

			const s = Symbol();
			set.add(s);
			doExec(app, set, s, exec, await iterator.next(), console.error);
		}
		if (iterator.close) await iterator.close();

		while (set.size > 0) await app.sleep(1);
	}
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