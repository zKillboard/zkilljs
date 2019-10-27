'use strict';

async function f(app) {
    let res = await app.phin(app.esi + '/latest/universe/factions/');
    if (res.statusCode == 200) {
        let json = JSON.parse(res.body);
        for (let row of json) {
            let infoRow = await app.db.information.findOne({
                type: 'faction_id',
                id: row.faction_id
            });
            if (infoRow != undefined && infoRow != null) {
                row.last_updated = Math.floor(Date.now() / 1000);
                await app.db.information.updateOne(infoRow, {
                    $set: row
                });
            }
        }
    } else throw 'Invalid faction result';
}

module.exports = f;