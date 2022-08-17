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

            return res;
        }

        console.log('zkilljs cron initialization complete');
        app.dbstats = [];
        first_run = false;
    }

    let keys = ['pending', 'fetched', 'parsed'];
    let total = 0;
    for (let key of keys) {
        let count = await app.db.killhashes.countDocuments({status: key});
        app.dbstats[key] = count;
        total += count;
    }
    app.dbstats.prices = await app.db.prices.countDocuments({waiting: true});
    total += app.dbstats.prices;
    app.dbstats['total'] = total;

    app.zinitialized = true;
}
