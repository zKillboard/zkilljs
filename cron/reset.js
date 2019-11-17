'use strict';

async function f(app) {
    let cursor = await app.db.rawmails.find({
        //killmail_id: 21112472
    }).sort({
        killmail_id: 1
    });
    while (await cursor.hasNext()) {
        let rawmail = await cursor.next();
        if (rawmail.victim == undefined) continue;
        var km_date = new Date(rawmail.killmail_time);
        let items = rawmail.victim.items;
        //console.log('checking ' + rawmail.killmail_id);
        if (await get_item_prices(app, items, km_date, false)) {
            console.log('resetting ' + rawmail.killmail_id);
            await app.db.killhashes.updateOne({
                killmail_id: rawmail.killmail_id
            }, {
                $set: {
                    status: 'fetched'
                }
            });

        }
    }



}

/*
async function f(app) {
    await app.db.killmails.removeMany({});
    await app.db.statistics.removeMany({});
    await app.db.killhashes.updateMany({}, {
        $set: {
            status: 'pending'
        }
    }, {
        multi: true
    });
}*/

async function get_item_prices(app, items, date, in_container) {
    let ret = false;
    for (let index in items) {
        const item = items[index];
        //await app.util.entity.add(app, 'item_id', item.item_type_id);

        if (item.items instanceof Array) return true;

        if (item.singleton != 0 || in_container == true || "2011-11-30" < date) {
            const item_info = await app.util.entity.info(app, 'item_id', item.item_type_id);
            const group = (item_info.group_id == undefined ? undefined : await app.util.entity.info(app, 'group_id', item_info.group_id));
            if (group != undefined) {
                const category = await app.util.entity.info(app, 'category_id', group.category_id);
                if (category != undefined) {
                    let oldMail = "2011-11-30" < date;
                    if (category.id == 9 && (item.singleton != 0 || in_container == true || oldMail)) {
                        return true;
                    }
                }
            }
        }

    }
    return ret;
}

module.exports = f;