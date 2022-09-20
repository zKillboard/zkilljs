'use strict';

module.exports = {
   paths: ['/', '/:type/:id', '/:type/:id/'],
   get: get,
   priority: 1
}

async function get(req, res) {
    const app = req.app.app;

    let type = req.params.type;
    let id = req.params.id;

    if (type == undefined) type = 'label';
    if (id == undefined) id = 'pvp';

    req.alternativeUrl = '/' + type + '/' + id;
    let valid = req.verify_query_params(req, {});
    if (valid !== true) return {redirect: valid};
    
    if (type != 'label') id = parseInt(id);

    if (id <= 0 || (type != 'label' && isNaN(id))) return {status_code: 404};

    var ret = {
        package: {title: 'zKillboard'},
        ttl: 900,
        view: 'index.pug'
    };

    return ret;
}