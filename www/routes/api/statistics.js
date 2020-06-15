'use strict';

module.exports = getData;

const utf8 = require('utf8');

async function getData(req, res) {
	let parsed = parseInt(req.params.id);
	req.params.id = parsed > 0 ? parsed : req.params.id;

    let result = await req.app.app.db.statistics.find({
        type: req.params.type,
        id: req.params.id
    }).toArray();

    return {
        json: (result.length == 1 ? result[0] : null), maxAge: 1
    };
}