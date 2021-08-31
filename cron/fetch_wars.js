'use strict';

let max_war_id = 0;

async function f(app) {
    if (app.no_parsing) return;

    if (process.env.fetch_wars != true) return;
    
    let res, json, min_id = 9999999999, max_id = 0;
    do {
    	if (app.bailout || app.no_api) return;
        
        let url = app.esi + '/v1/wars/' + (min_id == 9999999999 ? '' : '?max_war_id=' + min_id);

        await app.util.assist.esi_limiter(app);
        res = await app.phin(url);
        await app.util.assist.esi_result_handler(app, res);

        if (res.statusCode == 200) {
            json = JSON.parse(res.body);

            for (let war_id of json) {
                if (war_id <= max_war_id) break;
                max_id = Math.max(war_id, max_id);

                if (app.bailing) throw 'fetch_wars.js bailing';
                min_id = Math.min(min_id, war_id);
                if (await app.db.information.countDocuments({
                        type: 'war_id',
                        id: war_id
                    }) == 0) {
                    await app.util.entity.add(app, 'war_id', war_id, false);
                }
            }
        } else json = [];
        await app.sleep(50);
    } while (json.length > 0 && min_id > 1 && min_id > max_war_id);
    max_war_id = max_id;
}

module.exports = f;