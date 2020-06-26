'use strict';

const set = new Set();

async function f(app) {
    if (app.no_parsing) return;

    let todays_price_key = app.util.price.get_todays_price_key();
    let now = new Date();

    let prices_cursor = await app.db.prices.find({
        waiting: true
    });

    let promises = [];
    while (await prices_cursor.hasNext()) {
        if (app.bailout == true || app.no_api) break;

        let row = await prices_cursor.next();
        if (isNaN(row.item_id)) continue;
        
        promises.push(update_price(app, row, todays_price_key));
        await app.sleep(1);
        while (set.size > 50) await app.sleep(1);
    }
    await app.waitfor(promises, 'update_prices');
}

async function update_price(app, row, todays_price_key) {
    let s = Symbol();
    set.add(s);
    try {
        const item_id = row.item_id;
        let updates = {};
        updates.waiting = false;
        updates.last_fetched = todays_price_key;

        if (row.zkill != true) {
            //console.log('Fetching zkill price history for ' + item_id);
            let res = await app.phin('https://zkillboard.com/api/prices/' + item_id + '/');
            if (res.statusCode == 200) {
                let json = JSON.parse(res.body);
                for (const [date, value] of Object.entries(json)) {
                    if (date == 'currentPrice') continue;
                    if (row[date] == undefined) {
                        updates[date] = value;
                    }
                }
                updates.zkill = true;
            } else if (res.statusCode == 404) {
                updates.zkill = true;
            } else {
                //console.log('unable to fetch zkill for ', item_id, ' statusCode: ', res.statusCode);
                return;
            }
        }
        if (row.no_fetch == true) {
            // This price endpoint no longer exists...
            //console.log('Skipping price check for ' + item_id);
            await app.db.prices.updateOne(row, {
                '$set': updates
            });
            return;
        }

        //console.log('Fetching price history for ' + item_id);
        var url = app.esi + '/v1/markets/10000002/history/?type_id=' + item_id;
        let res = await app.phin(url);
        if (res.statusCode == 200) {
            app.zincr('esi_fetched');
            let json = JSON.parse(res.body);
            for (const day of json) {
                if (row[day.date] == undefined) {
                    updates[day.date] = day.average;
                }
            }
            await app.db.prices.updateOne(row, {
                '$set': updates
            });
        } else if (res.statusCode == 404) {
            updates.no_fetch = true;
            await app.db.prices.updateOne(row, {
                '$set': updates
            });
            //console.log('Marking price check for ' + item_id + ' as no_fetch');
            await app.sleep(1000);
        } else {
            console.log('Price fetch ended in error: ' + res.statusCode, url);
        }
    } finally {
        set.delete(s);
    }
}

module.exports = f;
