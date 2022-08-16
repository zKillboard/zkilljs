'use strict';

module.exports = {
    exec: f,
    span: 1
}

const sw = require('../util/StreamWatcher.js');
const match = {
    check_wars: true
};
var firstRun = true;

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    if (process.env.fetch_wars != 'true') return;

    if (firstRun) {
        sw.start(app, app.db.information, match, fetchWarMails, 1);
        firstRun = false;
    }
}

async function fetchWarMails(app, row) {
    let page = 1, count = 0;
    let url, res, json;

    do {
        url = process.env.esi_url + '/v1/wars/' + row.id + '/killmails/?page=' + page;
        res = await app.phin(url);

        if (res.statusCode == 200) {
            json = JSON.parse(res.body);
            for (let mail of json) {
                if (app.bailout || app.no_api) return;
                await app.util.killmails.add(app, mail.killmail_id, mail.killmail_hash);
                count++;
            }
        }
        page++;
    } while (res.statusCode == 200 && ((row.total_kills || 0) < count));

    await app.db.information.updateOne(row, {$unset: {check_wars: 1}});
    await app.db.information.updateOne(row, {$set: {last_updated: app.now()}});
}