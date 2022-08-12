'use strict';

module.exports = {
    exec: f,
    span: 1
}

let first_run = true;

async function f(app) {
    while (app.zindexes_added != true) await app.sleep(100);

    if (process.env.balance_resources == 'true') {
        let many_stats = 
            await hasMinimum(app.db.statistics, {update_alltime: true}, 1000) ||
            await hasMinimum(app.db.statistics, {update_recent: true}, 1000) ||
            await hasMinimum(app.db.statistics, {update_weekly: true}, 1000);
        app.delay_parse = false; // await hasMinimum(app.db.killhashes, {status: 'pending'}, 25);
        app.delay_prep = app.delay_parse || await hasMinimum(app.db.killhashes, {status: 'fetched'}, 25);
        app.delay_stat = app.delay_prep || await hasMinimum(app.db.killhashes, {status: 'parsed'}, 25);
        app.no_fetch_dailies = app.delay_parse || app.delay_prep || app.delay_stat || many_stats;
    } else {
        app.delay_parse = false;
        app.delay_prep = false;
        app.delay_stat = false;
        app.no_fetch_dailies = false;
    }

    if (first_run == true) {
        console.log('zkilljs cron initialization complete');
        first_run = false;
    }
    app.zinitialized = true;
}

async function hasMinimum(collection, query, min) {
    var cursor = await collection.find(query).limit((min + 3));
    try {
        var count = 0;
        while (await cursor.hasNext()) {
            let f = await cursor.next(); // throw it away
            f = null;
            count++;
            if (count >= min) return true;
        }
    }  finally {
        collection = null;
        cursor = null;
    }
    return false;
}
