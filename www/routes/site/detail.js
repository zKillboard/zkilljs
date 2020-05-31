'use strict';

module.exports = getData;

async function getData(req, res) {
	const app = req.app.app;


    var ret = {
        json: {
            zmail: '',
            rawmail: ''
        },
        maxAge: 1
    };
    ret.json = await app.util.info.fill(req.app.app, ret.json);
    return ret;
}