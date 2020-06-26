'use strict';

module.exports = f;

async function f(app) {
    var promises = [];
    // Set locations fetched flag to false where it is missign for solar systems
    await app.db.information.updateMany({type: 'solar_system_id', locations_fetched: {'$exists': false}}, {$set: {locations_fetched: false}}, {multi: true});

    // Find any solar systems where locations need to be fetched
    let result = await app.db.information.find({
        type: 'solar_system_id',
        locations_fetched: false
    }).toArray();

    for (const row of result) {
        promises.push(fetch_locations(app, row));
        if (promises.length > 10) {
            var p = promises.shift();
            await p;
        }
    }
    await app.waitfor(promises);
}

async function fetch_locations(app, system_row) {
    console.log('Fetching fuzz map for system ' + system_row.id);
    let res = await app.phin('https://www.fuzzwork.co.uk/api/mapdata.php?solarsystemid=' + system_row.id + '&format=json');
    if (res.statusCode == 200) {
        let body = JSON.parse(res.body);

        // Be sure all locations are stored
        for (var b of body) {
            var row = {
                type: 'location_id',
                id: Number.parseInt(b.itemid),
                solar_system_id: system_row.id,
                constellation_id: Number.parseInt(b.constellationid),
                region_id: Number.parseInt(b.regionid),
                type_id: Number.parseInt(b.typeid),
                x: b.x,
                y: b.y,
                z: b.z,
                name: b.itemname,
                last_updated: Math.floor(Date.now() / 1000),
            }
            row.location_id = row.id;
            await app.db.information.deleteOne({
                type: 'location_id',
                id: row.id
            });
            await app.db.information.insertOne(row);
        }
        console.log(system_row.id + ' has ' + body.length + ' locations');
        await app.db.information.updateOne({
            _id: system_row._id
        }, {
            $set: {
                locations_fetched: true
            }
        });
    } else console.log('Fuzzmap for ' + solar_system_id + ' has HTTP code: ' + res.statusCode);
}