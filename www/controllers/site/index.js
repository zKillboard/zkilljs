'use strict';

module.exports = {
   paths: ['/', '/:type/:id'],
   get: get,
   priority: 1
}

async function get(req, res) {
    const app = req.app.app;

    let type = req.params.type;
    let id = req.params.id;
    
    if (type != 'label') id = parseInt(id);

    if (id <= 0 || (type != 'label' && isNaN(id))) return {status_code: 404};

    var ret = {
        package: {title: 'zKillboard'},
        ttl: 900,
        view: 'index.pug'
    };

    return ret;
}