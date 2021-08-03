'use strict';

var past_fetch_remaining = 0;
var past_parse_remaining = 0;
var past_stats_reamining = 0;

async function f(app) {
    app.delay_parse = await hasMinimum(app.db.killhashes, {status: 'pending'}, 25);
    app.delay_prep = app.delay_parse || await hasMinimum(app.db.killhashes, {status: 'fetched'}, 25);
    app.delay_stat = app.delay_prep || await hasMinimum(app.db.killhashes, {status: 'parsed'}, 25);

    var no_fetch_dailies = app.delay_parse || app.delay_prep || app.delay_stat;
    //if (no_fetch_dailies == false) no_fetch_dailies = await hasMinimum(app.db.statistics, {update_week: true}, 100);
    //if (no_fetch_dailies == false) no_fetch_dailies = await hasMinimum(app.db.statistics, {update_recent: true}, 100);
    //if (no_fetch_dailies == false) no_fetch_dailies = await hasMinimum(app.db.statistics, {update_alltime: true}, 100);
    app.no_fetch_dailies = no_fetch_dailies;
}

async function hasMinimum(collection, query, min) {
    var cursor = await collection.find(query);
    var count = 0;
    while (await cursor.hasNext()) {
        await cursor.next(); // throw it away
        count++;
        if (count > min) return true;
    }
    return false;
}

module.exports = f;