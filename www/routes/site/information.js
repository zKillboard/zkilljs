'use strict';

module.exports = getData;

async function getData(req, res) {
    if (req.params.type != 'label') req.params.id = parseInt(req.params.id);
    let result = await req.app.app.db.information.findOne({type: req.params.type, id: req.params.id});
    if (result == null) return { json: req.params.type + ' ' + req.params.id};
    return { json: result[req.params.field]};
}