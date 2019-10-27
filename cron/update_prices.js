'use strict';

async function f(app) {
    let todays_price_key = app.util.price.get_todays_price_key();
    let now = new Date();

    let prices = await app.db.prices.find({
        last_fetched: {
            '$ne': todays_price_key
        }
    }).limit(25).toArray();

    let promises = [];
    for (let row of prices) {
        if (app.bailout == true) break;
        promises.push(update_price(app, row, todays_price_key));
    }
    await app.waitfor(promises);
    //console.log('done fetching');
}

async function update_price(app, row, todays_price_key) {
    const item_id = row.item_id;
    let updates = {};

    if (row.zkill != true) {
        console.log('Fetching zkill price history for ' + item_id);
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
            console.log('unable to fetch zkill for ', item_id, ' statusCode: ', res.statusCode);
            return;
        }
    }

    console.log('Fetching price history for ' + item_id);
    let res = await app.phin(app.esi + '/v1/markets/10000002/history/?type_id=' + item_id);
    if (res.statusCode == 200) {
        let json = JSON.parse(res.body);
        for (const day of json) {
            if (row[day.date] == undefined) {
                updates[day.date] = day.average;
            }
        }
    }
    updates.last_fetched = todays_price_key;
    await app.db.prices.updateOne(row, {
        '$set': updates
    });
}

module.exports = f;

/*
 |//| marketHistory.last_fetched != todays_key) {
            console.log('Fetching price history for ' + item_id);
            let res = await app.phin(app.esi + '/v1/markets/10000002/history/?type_id=' + item_id);
            let json = JSON.parse(res.body);

            if (marketHistory == null) marketHistory = {};
            let updates = {};
            for (let i = 0; i < json.length; i++) {
                let day = json[i];
                if (marketHistory[day.date] == undefined) {
                    updates[day.date] = day.average;
                    marketHistory[day.date] = day.average;
                }
            }
            updates.last_fetched = todays_key;
            if (Object.keys(updates).length) {
                await app.db.prices.updateOne({
                    item_id: item_id
                }, {
                    $set: updates
                }, {
                    upsert: true
                });
            }
        }
       */