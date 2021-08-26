'use strict';

module.exports = getData;

const utf8 = require('utf8');

async function getData(req, res) {
    const app = req.app.app;

    return { result: (await app.redis.get("server-information")) };
}