'use strict';

var past_fetch_remaining = 0;
var past_parse_remaining = 0;
var past_stats_reamining = 0;

async function f(app) {
	let fetch_ramaining = await app.db.killhashes.countDocuments({status: 'pending'});

    let parse_remaining = await app.db.killhashes.countDocuments({status: 'fetched'});
    
    let stats_remaining = await app.db.statistics.countDocuments({update_alltime: true});
    stats_remaining += await app.db.statistics.countDocuments({update_recent: true});

    let fetch_diff = fetch_ramaining - past_fetch_remaining;
	let parse_diff = parse_remaining - past_parse_remaining;
	let stats_diff = stats_remaining - past_stats_reamining;

    app.delay_parse = (fetch_ramaining > 100);
    app.delay_stats = app.delay_parse || (parse_remaining > 100);
    app.delay_fetches = app.delay_stats || (stats_remaining > 1000);

    console.log([
    		text('fetch', fetch_ramaining, fetch_diff),
    		text('parse', parse_remaining, parse_diff),
			text('stats', stats_remaining, stats_diff)
    	].join(', '));

    past_fetch_remaining = fetch_ramaining;
    past_parse_remaining = parse_remaining;
    past_stats_reamining = stats_remaining;
}

function text(key, now, delta) {
	return key + ': ' + now + ' (' + delta + ')';
}


module.exports = f;