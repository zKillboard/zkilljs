'use strict';

module.exports = {
    exec: f,
    span: 60
}


async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    var factionCount = await app.db.information.countDocuments({type: 'faction_id', last_updated: {'$lt': (Date.now() / 1000)}});
    if (factionCount == 0) return;
    
    console.log('Updating factions');

    let res = await app.phin(process.env.esi_url + '/latest/universe/factions/');

    if (res.statusCode == 200) {
        let json = JSON.parse(res.body);
        for (let row of json) {
            let infoRow = await app.db.information.findOne({
                type: 'faction_id',
                id: row.faction_id
            });
            if (infoRow != undefined && infoRow != null) {
                row.last_updated = Math.floor(Date.now() / 1000) + (86400 * 7);
                await app.db.information.updateOne(infoRow, {
                    $set: row
                });
            }
            await app.mysql.query('replace into autocomplete values (?, ?, ?, ?)', ['faction_id', row.faction_id, row.name, null]);
        }
    } else throw 'Invalid faction result';
}