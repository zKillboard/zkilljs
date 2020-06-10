'use strict';

async function getData(req, res) {
	let parsed = parseInt(req.params.id);
	req.params.id = parsed > 0 ? parsed : req.params.id;

	let result = await req.app.app.db.statistics.findOne({
        type: req.params.type + '_id',
        id: req.params.id
    });

    var data = {};
    add(result, data, 'alltime');
    add(result, data, 'recent');
    add(result, data, 'week');

    return {json: data};
}

function add(result, data, type) {
	data[type + '-kills'] = get(result, type, 'killed');
	data[type + '-isk-killed'] = get(result, type, 'isk_killed');
	data[type + '-lost'] = get(result, type, 'lost');
	data[type + '-isk-lost'] = get(result, type, 'isk_lost');

}

function get(result, part1, part2) {
	if (result[part1] != undefined && result[part1][part2] != undefined) return result[part1][part2];
	return '';
}

module.exports = getData;