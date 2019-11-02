'use strict';

async function f(app) {
    if (app.no_parsing) return;
    
    let row = await app.db.information.findOne({
        check_wars: true
    });
    if (row == null) return;

    let page = 1,
        url, res, json;
    do {
        let url = app.esi + '/v1/wars/' + row.id + '/killmails/?page=' + page;
        let res = await app.phin(url);
        if (res.statusCode != 200) return; // Something went wrong!

        json = JSON.parse(res.body);
        for (let mail of json) {
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