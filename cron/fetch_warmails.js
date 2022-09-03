'use strict';

module.exports = {
    exec: f,
    span: 5
}

async function f(app) {
    if (process.env.fetch_all_warmails != 'true') return;
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    const result = await app.db.information.find({check_wars: true}).limit(1).toArray();
    if (result.length == 0) return;

    await fetchWarMails(app, result[0]);
}

async function fetchWarMails(app, row) {
    let page = 1, count = 0;
    let url, res, json;
    let max_war_killmail_id = row.max_war_killmail_id | 0;
    let this_max_killmail_id = 0;
    let fetch_complete = false;
    let total_kills = (row.aggressor.ships_killed | 0) + (row.defender.ships_killed | 0);

    if (total_kills == 0) {
        return await app.db.information.updateOne({_id: row._id}, {$unset: {check_wars: 1}});
    }

    page = Math.ceil(total_kills / 2000);

    do {
        url = process.env.esi_url + '/v1/wars/' + row.id + '/killmails/?page=' + page;
        res = await app.phin(url);
        app.util.ztop.zincr(app, 'info_war_mails', count);

        if (res.statusCode != 200) return; // we'll try again later

        json = JSON.parse(res.body);
        for (let mail of json) {
            if (app.bailout || app.no_api) return;

            count += await app.util.killmails.add(app, mail.killmail_id, mail.killmail_hash);
            this_max_killmail_id = Math.max(this_max_killmail_id, mail.killmail_id);

            if (max_war_killmail_id == mail.killmail_id) {
                fetch_complete = true;
                break;
            }
        }
        page--;
        if (page > 0) await app.sleep(5000);
    } while (page > 0 && fetch_complete == false);
    this_max_killmail_id = Math.max(this_max_killmail_id, max_war_killmail_id);

    if (count > 0) {
        console.log('war_id', row.id, 'added', count, 'killmails');
        app.util.ztop.zincr(app, 'killmail_imported_warmails', count);
    }

    await app.db.information.updateOne({_id: row._id}, {$set: {max_war_killmail_id: this_max_killmail_id}, $unset: {check_wars: 1}});
}