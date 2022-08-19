'use strict';

module.exports = {
    exec: f,
    span: 1
}

let concurrent = 0;
let concurrent_max = 10;

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    if (app.no_api == true) return;
    
    let todays_price_key = app.util.price.get_todays_price_key();
    let now = new Date();

    let prices_cursor = await app.db.prices.find({waiting: true});

    while (concurrent > 0) await app.sleep(1000);
    while (await prices_cursor.hasNext()) {
        if (app.bailout == true) break;

        let row = await prices_cursor.next();
        if (isNaN(row.item_id)) continue;
    
        while (concurrent >= concurrent_max) await app.sleep(100);    
        concurrent++;
        update_price(app, row, todays_price_key);
    }
    while (concurrent > 0) await app.sleep(100);
}

async function update_price(app, row, todays_price_key) {
    try {
        const item_id = row.item_id;
        let updates = {};
        updates.waiting = false;
        updates.last_fetched = todays_price_key;

        if (row.zkill != true) {
            let res = await app.phin('https://zkillboard.com/api/prices/' + item_id + '/');
            if (res.statusCode == 200) {
                let json = JSON.parse(res.body);
                const entries = Object.entries(json);
                for (const [date, value] of entries) {
                    if (date == 'currentPrice' || date == 'typeID' || date == 'last_fetched') continue;
                    if (row[date] == undefined) {
                        updates[date] = (Math.round(value * 100) / 100);
                        row[date] = updates[date];
                    }
                }
                updates.zkill = true;
                if (row[todays_price_key] == undefined) { // nothing to show for us here
                    row[todays_price_key] = json.currentPrice;
                    updates[todays_price_key] = json.currentPrice;
                }
                app.util.ztop.zincr(app, 'price_fetch');
            } else if (res.statusCode == 404) {
                updates.zkill = true;
            } else {
                console.log('unable to fetch zkill for ', item_id, ' statusCode: ', res.statusCode);
                return;
            }
        }

        if (row[todays_price_key] != undefined) { // looks like we have what we need
            // console.log('Price fetch completed for', item_id);
            let mres = await app.db.prices.updateOne({item_id: item_id}, {'$set': updates});
            return;
        }

        if (row.no_fetch == true) {
            // This price endpoint no longer exists...
            //console.log('Skipping price check for ' + item_id);
            await app.db.prices.updateOne({item_id: row.item_id}, {'$set': updates});
            return;
        }

        
        if (app.no_api) {
            console.log('no api - bailing on price fetch for', item_id);
            return;
        }

        var url = process.env.esi_url + '/v1/markets/10000002/history/?type_id=' + item_id;
        // console.log('Fetching ESI prices for', item_id); 
        let res = await app.phin(url);

        if (res.statusCode == 200) {
            let json = JSON.parse(res.body);
            for (const day of json) {
                if (row[day.date] == undefined) {
                    updates[day.date] = day.average;
                }
            }
            await app.db.prices.updateOne({item_id: row.item_id}, {'$set': updates});
            app.util.ztop.zincr(app, 'price_fetch_esi');
        } else if (res.statusCode == 404) {
            updates.no_fetch = true;
            await app.db.prices.updateOne({item_id: row.item_id}, {'$set': updates});
            //console.log('Marking price check for ' + item_id + ' as no_fetch');
            app.util.ztop.zincr(app, 'price_fetch_esi_error');
            await app.sleep(1000);
        } else {
            console.log('Price fetch ended in error: ' + res.statusCode, url);
            app.util.ztop.zincr(app, 'price_fetch_esi_error');
            await app.sleep(1000);
        }
    } catch(e) {
        console.log(e);
    } finally {
        concurrent--;
    }
}