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
        app.orig_phin = app.phin;
        app.phin = phin_replace.bind(app);

        console.log('zkilljs cron initialization complete');
        app.dbstats = [];
        app.no_api = true; // don't hit the API until we've checked TQ's status
        app.bailout = false;
        app.rate_limit = 0;
        first_run = false;
        await app.util.assist.fetch_tq_status(app);
    }

    let keys = ['pending', 'fetched', 'parsed'];
    let total = 0;
    for (let key of keys) {
        let count = await has_min(app, app.db.killhashes, {status: key}, 1000);
        app.dbstats[key] = count;
        total += count;
    }
    app.dbstats.prices = await app.db.prices.countDocuments({waiting: true});
    total += app.dbstats.prices;
    app.dbstats['total'] = total;

    keys = ['update_alltime', 'update_recent', 'update_week'];
    total = 0;
    for (let key of keys) {
        let count = await has_min(app, app.db.statistics, {[key]: true}, 1000);
        app.dbstats[key] = count;
        total += count;
    }
    total += await has_min(app, app.db.statistics, {'week.update_top': true}, 1000);
    app.dbstats['stats_total'] = total;

    app.zinitialized = true;
}

async function has_min(app, collection, query, min) {
    let iterator = await collection.find(query).project({_id: 1});
    let count = 0;
    while (await iterator.hasNext()) {
        await iterator.next();
        count++;
        if (count >= min) break;
    }
    await iterator.close();
    return count;
}

async function phin_replace(options, attempts = 0) {
    if (attempts > 5) {
        console.log('too many timeout attempts');
        throw {statusCode: 502, message: 'too many timeout attempts'};
    }

    let app = this;
    try {
        if (typeof options == 'string') options = {url: options};
        options.timeout = 10000;

        const esi_url = (options.url.indexOf(process.env.esi_url) > -1);
        const esi_url_status_check = (options.url == (process.env.esi_url + '/latest/status/'));
        if (esi_url && !esi_url_status_check) {
            while (app.no_api == true) await app.sleep(1000);
        }

        if (esi_url && options.no_limit != true) await app.util.assist.esi_limiter(app);
        delete options.no_limit;
        let res = await app.orig_phin(options);
        if (esi_url) await app.util.assist.esi_result_handler(app, res, options.url);

        return res;
    } catch (e) {
        if (e.message != undefined && (e.message.indexOf('Timeout') > -1 || e.message.indexOf('ETIMEDOUT') > -1)) {
            await app.sleep(5000); // try again
            return await phin_replace.bind(app, options, (attempts + 1));
        } else throw e;
    }
}