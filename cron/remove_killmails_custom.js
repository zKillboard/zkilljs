'use strict';

let epochs = ['killmails', 'killmails_90', 'killmails_7'];

async function f(app) {
    var key = process.argv[3];
    var id = process.argv[4];
    id = parseInt(id);
    let query = {[key]: id};

    let results = await app.db.killmails.find(query);
    while (await results.hasNext()) {
        let row = await results.next();
        console.log('Resetting ', row.killmail_id);
        await app.util.killmails.remove_killmail(app, 'killmails', row, 'alltime');
        await app.db.killhashes.updateOne({killmail_id: row.killmail_id}, {$set: {status: 'fetched'}});
    }
    console.log('done');
}

module.exports = f;