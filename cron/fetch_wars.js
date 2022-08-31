'use strict';

module.exports = {
    exec: f,
    span: 9600
}

async function f(app) {
    if (process.env.fetch_all_wars != 'true') return;
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    try {
        let result = await app.db.settings.findOne({key: 'wars_added'});
        if (result == null) result = {value: false};
        let all_wars_added = result.value;
        
        let res, json, min_id = 9999999999, max_id = 0;
        let wars_added = 0;

        let url = process.env.esi_url + '/v1/wars/' + (min_id == 9999999999 ? '' : '?max_war_id=' + min_id);

        if (app.bailout || app.no_api) return;
        res = await app.phin(url);

        if (res.statusCode == 200) {
            json = JSON.parse(res.body);

            const max_war_id = json.pop();

            for (let i = max_war_id; i >= 1; i--) {
                let count = await app.db.information.countDocuments({type: 'war_id', id: i});
                if (count > 0 && all_wars_added) break; // we're done. only fully iterate the first time
                if (count == 0) {
                    await app.util.entity.add(app, 'war_id', i, false);
                    await app.sleep(10);
                    wars_added++;
                }
            }
        }
        console.log('wars added', wars_added);
        await app.db.settings.updateOne({key: 'wars_added'}, {$set: {key: 'wars_added', value: true}}, {upsert: true});
    } catch (e) {
        console.log(e);
    }
}