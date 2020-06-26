'use strict';

var types = ['solar_system_id', 'constellation_id', 'region_id', 'location_id'];

async function f(app) {
    var iter = await app.db.killmails.find({
        'involved.location_id': NaN
    });
    while (await iter.hasNext()) {
        const row = await iter.next();

        const rawmail = await app.db.rawmails.findOne({
            killmail_id: row.killmail_id
        });

        if (rawmail.victim.position != undefined) {
            const location_id = await app.util.info.get_location_id(app, rawmail.solar_system_id, rawmail.victim.position);

            if (location_id != undefined && !isNaN(location_id)) {
                await app.db.killmails.updateOne({
                    killmail_id: row.killmail_id
                }, {
                    '$set': {
                        'involved.location_id': [location_id]
                    }
                });
            }

        }
    }
    console.log('done');
    process.exit();
}

module.exports = f;