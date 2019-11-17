'use strict';

const sw = require('../util/StreamWatcher.js');
const match = {
    check_wars: true
};
var firstRun = true;

async function f(app) {
    if (firstRun) {
        sw.start(app, app.db.information, match, fetchWarMails, 10);
        firstRun = false;
    }
}

async function fetchWarMails(app, row) {
    let page = 1;
    let url, res, json;
    do {
        let url = app.esi + '/v1/wars/' + row.id + '/killmails/?page=' + page;
        let res = await app.phin(url);
        if (res.statusCode != 200) return; // Something went wrong!
        app.zincr('esi_fetched');

        json = JSON.parse(res.body);
        for (let mail of json) {
            if (app.bailout) return;
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

module.exports = f;