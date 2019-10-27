'use strict';

module.exports = f;

async function f(app) {
    let promises = [];
    let rows = await app.db.information.find({
        'type': 'location_id',
        'last_updated': 0
    }).toArray();

    for (let i = 0; i < rows.length; i++) {
        promises.push(fetch_locations(app, rows[i], rows[i].id));
    }

    await app.waitfor(promises);
}

async function fetch_locations(app, row, solar_system_id) {
    console.log('Fetching fuzz map for system ' + solar_system_id);
    let res = await app.phin('https://www.fuzzwork.co.uk/api/mapdata.php?solarsystemid=' + solar_system_id + '&format=json');
    let body = JSON.parse(res.body);
    if (body.length > 0) {
        await app.db.information.updateOne(row, {
            $set: {
                locations: body,
                last_updated: 5570334857
            }
        });
    }
}