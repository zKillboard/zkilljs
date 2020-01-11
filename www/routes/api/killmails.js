'use strict';

module.exports = getData;

async function getData(req, res) {
	let query = {};
	if (req.params.type == 'label') query['labels'] = req.params.id;
	else {
		var id = parseInt(req.params.id);
		var key = 'involved.' + req.params.type;
		query['$or'] = [{[key]: id}, {[key]: (-1 * id)}];
	}

    let result = await req.app.app.db.killmails.find(query)
    	.sort({killmail_id: -1})
    	.limit(500)
    	.project({
        	_id: 0,
        	killmail_id: 1,
        	hash: 1
    }).toArray();

    return {
        json: result
    };
}