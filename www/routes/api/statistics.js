'use strict';

module.exports = getData;

const utf8 = require('utf8');

async function getData(req, res) {
	let parsed = parseInt(req.params.id);
	req.params.id = parsed > 0 ? parsed : req.params.id;

    let result = await req.app.app.db.statistics.find({
        type: req.params.type,
        id: req.params.id
    }).project({
        _id: 0,
        update: 0,
        sequence: 0,
        last_sequence: 0
    }).toArray();
    return {
        json: (result.length == 1 ? result[0] : null)
    };
}