'use strict';

module.exports = getData;

async function getData(req, res) {
	//const app = req.app.app;

    console.log('original: ' , req.originalUrl);
    if (req.originalUrl == '/') return '/label/all';

    var ret = {
        json: {title: 'zKillboard'},
        maxAge: 1
    };

    return ret;
}