'use strict';

// poor man's mutex

var mutexes = {};

// TODO find a library that does this better?

const pmm = {
	acquire: async function (app, key) {
		while (mutexes[key] != undefined) {
			mutexes[key] = true;
			await app.sleep(15);
		}
		mutexes[key] = true;
		return;
	},

	isLocked: function (key) {
		return mutexes[key] == true;
	},

	release: async function (key) {
		delete mutexes[key];
	}
}

module.exports = pmm;