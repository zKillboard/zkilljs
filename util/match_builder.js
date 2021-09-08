'use strict';

async function match_builder(app, req, kl_default = 'all') {

	if (req.params.type == 'system') {
		req.params.type = 'solar_system';
	} else if (req.params.type == 'type') {
		req.params.type = 'item';
	}

	var type = req.params.type;
	var id = req.params.id;
	var key = type;
	var timespan;
	var epoch = req.params.epoch || 'week'; // default to week if epoch is not available
	var modifiers = (req.query['modifiers'] == undefined ? [] : req.query.modifiers.split(','));

    let match = {};

    var match_and = [];
    var kl = undefined;

    if (type != 'label') {
    	id = parseInt(id);
    	if (id == undefined) id = 0;
    	type = type + '_id';
    	key = 'involved.' + type;
    }

    for (const modifier of modifiers) {
        switch (modifier) {
            case 'killed':
            case 'lost':
                kl = modifier;
                break;
            case 'week':
            case 'recent':
            case 'alltime':
                epoch = modifier;
                timespan = modifier;
                break;
            case 'current-month':
                var date = new Date(), y = date.getFullYear(), m = date.getMonth();
                var firstDay = new Date(y, m, 1);
                // var lastDay = new Date(y, m + 1, 0);
                epoch = 'recent'
                match_and.push({epoch : {'$gte' : Math.floor(firstDay.getTime() / 1000) }});
                timespan = 'current month';
                break;
            case 'prior-month':
                var date = new Date(), y = date.getFullYear(), m = date.getMonth();
                var firstDay = new Date(y, m - 1, 1);
                var lastDay = new Date(y, m + 1, 0);
                epoch = 'recent'
                match_and.push({epoch : {'$gte' : Math.floor(firstDay.getTime() / 1000) }});
                match_and.push({epoch : {'$lt' : Math.floor(lastDay.getTime() / 1000) }});
                timespan = 'prior month';
                break;
            default:
                match_and.push({
                    labels: modifier.replace(' ', '+')
                });
        }
    }
    if (kl == undefined) kl = kl_default;

    if (type == 'label') {
        if (id != 'all') match_and.push({labels: id});
    } else {
    	var or = [];
        if (kl == 'all' || kl == 'killed') or.push({[key]: id});
        if (kl == 'all' || kl == 'lost') or.push({[key]: -1 * id});

        if (or.length == 1) match_and.push(or[0]);
        else match_and.push({'$or': or});
    }

    if (match_and.length == 0) match = {};
    else if (match_and.length == 1) match = match_and[0];
    else match['$and'] = match_and;

    return {
    	type: type,
    	id: id,
    	key: key,
    	timespan: timespan,
    	kl: kl,
    	epoch: epoch,
    	match: match,
    	collection: (epoch == 'week' ? 'killmails_7' : (epoch == 'recent' ? 'killmails_90' : (epoch == 'alltime' ? 'killmails' : undefined)))

    };
}

module.exports = match_builder;