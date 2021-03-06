'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;

    let query = {
        type: (req.params.type == 'label' ? 'label' : req.params.type + '_id'),
        id: (req.params.type == 'label' ? req.params.id : Math.abs(parseInt(req.params.id)))
    };

    let result = await req.app.app.db.statistics.find(query).toArray();
    let row = result[0];
    if (row.alltime == undefined) row.alltime = {};
    if (row.recent == undefined) row.recent = {};
    if (row.week == undefined) row.week = {};

    var ret = {
        json: result[0],
        maxAge: 1
    };

    return ret;
}