'use strict';

module.exports = getData;

async function getData(req, res) {
	//const app = req.app.app;

    var ret = {
        json: {title: 'zKillboard'},
        maxAge: 1
    };

    return ret;
}