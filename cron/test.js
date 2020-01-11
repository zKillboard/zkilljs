module.exports = f;

async function f(app) {
    let rawmail = await app.db.rawmails.findOne({
        killmail_id: 26535526
    });
    await iterate(app, rawmail.victim.items, rawmail.killmail_time);
    process.exit();
}

async function iterate(app, items, date) {
    console.log(date);

    let max = 0,
        maxItem, total = 0;
    for (let i of items) {
        if (i.items instanceof Array) await iterate(app, item.items, date);
        let price = await app.util.price.get(app, i.item_type_id, date);
        if (max < price) {
            maxItem = i;
            max = price;
        }
        i.quantity_destroyed = i.quantity_destroyed || 0;
        i.quantity_dropped = i.quantity_dropped || 0;
        let qty = i.quantity_destroyed + i.quantity_dropped;
        total += qty * price;
    }
    console.log(maxItem);
    console.log(max);
    console.log(total);
}