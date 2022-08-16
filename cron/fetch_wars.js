'use strict';

module.exports = {
    exec: f,
    span: 9600
}

let wars_added = false;

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    if (app.no_parsing) return;

    if (process.env.fetch_wars != 'true') return;
    
    let res, json, min_id = 9999999999, max_id = 0;
    
    let url = process.env.esi_url + '/v1/wars/' + (min_id == 9999999999 ? '' : '?max_war_id=' + min_id);
    console.log(url);

    if (app.bailout || app.no_api) return;
    res = await app.phin(url);

    if (res.statusCode == 200) {
        json = JSON.parse(res.body);

        const max_war_id = json.pop();

        for (let i = max_war_id; i >= 1; i--) {
            let count = await app.db.information.countDocuments({type: 'war_id', id: i});
            if (count > 0 && wars_added) return; // we're done. only fully iterate the first time
            if (count == 0) {
                await app.util.entity.add(app, 'war_id', i, false);
                await app.sleep(10);
            }
        }
        wars_added = true;
    }
}