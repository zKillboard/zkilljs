'use strict';

// interval 1

const sw = require('../util/StreamWatcher.js');
const match = {
    check_wars: true
};
var firstRun = true;

async function f(app) {
    if (process.env.fetch_wars != true) return;

    if (firstRun) {
        sw.start(app, app.db.information, match, fetchWarMails, 10);
        firstRun = false;
    }
}

async function fetchWarMails(app, row) {
    let page = 1;
    let url, res, json;
    do {
        let url = process.env.esi_url + '/v1/wars/' + row.id + '/killmails/?page=' + page;
        await app.util.assist.esi_limiter(app);
        let res = await app.phin(url);
        if (res.statusCode != 200) return; // Something went wrong!
        app.zincr('esi_fetched');

        json = JSON.parse(res.body);
        for (let mail of json) {
            if (app.bailout || app.no_api) return;
            await app.util.killmails.add(app, mail.killmail_id, mail.killmail_hash);
        }
        page++;
    } while (json.length > 0);
    await app.db.information.updateOne(row, {
        $unset: {
            check_wars: 1
        }
    });
}