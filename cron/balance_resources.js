'use strict';

module.exports = {
    exec: f,
    span: 1
}

let first_run = true;
let orig_phin;

async function f(app) {
    while (app.zindexes_added != true) await app.sleep(100);

    if (first_run == true) {
        // override default phin behavior
        orig_phin = app.phin;
        app.phin = async function(options) {
            if (typeof options == 'string') options = {url: options};

            const esi_url = (options.url.indexOf(process.env.esi_url) > -1);

            if (esi_url) await app.util.assist.esi_limiter(app);
            let res = await orig_phin(options);
            if (esi_url) await app.util.assist.esi_result_handler(app, res);

            //console.log(res.statusCode, options.url);

            return res;
        }

        console.log('zkilljs cron initialization complete');
        first_run = false;
    }

    if (process.env.balance_resources == 'true') {
        app.delay_parse = await hasMinimum(app.db.killhashes, {status: 'pending'}, 25);
        app.delay_prep = app.delay_parse || await hasMinimum(app.db.killhashes, {status: 'fetched'}, 25);
        app.delay_stat = app.delay_parse || app.delay_prep || await hasMinimum(app.db.killhashes, {status: 'parsed'}, 25);
        app.fetch_dailies = !(app.delay_prep);

        /*if (app.delay_stat == false) {
            let hasMin = false;
            hasMin |= await hasMinimum(app.db.statistics, {update_alltime: true}, 100);
            if (!hasMin) hasMin |= await hasMinimum(app.db.statistics, {update_recent: true}, 100);
            if (!hasMin) hasMin |= await hasMinimum(app.db.statistics, {update_week: true}, 100);
            app.fetch_dailies = !hasMin;
        }*/
    } else {
        app.delay_parse = false;
        app.delay_prep = false;
        app.delay_stat = false;
        app.fetch_dailies = true;
    }

    // Overrride and allow stats if API is offline
    if (app.no_api) app.delay_stat = false;

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
