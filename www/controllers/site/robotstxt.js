'use strict';

module.exports = {
   paths: '/robots.txt',
   get: get
}

async function get(req, res) {
	return {
		package: 'User-agent: *\nDisallow: /',
		content_type: 'text/plain'
	};
}