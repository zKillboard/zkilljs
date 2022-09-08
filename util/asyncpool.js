'use strict';

// inspired by https://github.com/rxaviers/async-pool

module.exports = {
	go: async function(iterator, exec, exec_continue = true, max_concurrent = 1, exec_this = undefined) {
		const set = new Set();

		while (await iterator.hasNext() && (exec_continue === true || await (exec_continue.bind(exec_this)()) === true)) {
			while (set.size >= (typeof max_concurrent == 'function' ? await (max_concurrent.bind(exec_this)()) : max_concurrent)) {
				let [promise, value] = await Promise.race(set);
				set.delete(promise);
			}

			const promise = (async () => await (exec.bind(exec_this, await iterator.next())()))().then(value => [promise, value]);
			set.add(promise);
		}
		if (iterator.close) await iterator.close();

		await Promise.allSettled(set)
	}
}