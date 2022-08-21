'use strict';

module.exports = {
   paths: ['/', '/:type/:id'],
   get: get,
   priority: 1
}

async function get(req, res) {
    var ret = {
        package: {title: 'zKillboard'},
        ttl: 0,
        view: 'index.pug'
    };

    return ret;
}