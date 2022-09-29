'use strict';

module.exports = {
   paths: '/robots.txt',
   get: get,
   ttl: 60
}

async function get(req, res) {
	return {
		package: 'User-agent: *\nDisallow: /',
		content_type: 'text/plain'
	};
}