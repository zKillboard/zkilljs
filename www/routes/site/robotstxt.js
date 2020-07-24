'use strict';

async function f(req, res) {
	return {
		json: 'User-agent: *\nDisallow: /',
		content_type: 'text/plain'
	};
}

module.exports = f;