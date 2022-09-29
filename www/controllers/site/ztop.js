'use strict';

module.exports = {
   paths: '/site/ztop.txt',
   get: get,
   ttl: 1
}

const utf8 = require('utf8');

async function get(req, res) {
    const app = req.app.app;

    return { 
        package: {result: await app.redis.get("server-information")},
        view: 'ztop.pug'
    };
}