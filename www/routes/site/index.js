'use strict';

module.exports = getData;

async function getData(req, res) {
    var ret = {
        json: {title: 'zKillboard'},
        maxAge: 1
    };

    return ret;
}