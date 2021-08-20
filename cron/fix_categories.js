'use strict';

module.exports = f;

async function f(app) {
    var groups = await app.db.information.find({type: 'group_id'});
    let row = null;
    do {
        row = await groups.next();
        if (row != null) {
            console.log(row.name, row.group_id, row.category_id);
            if (row.category_id != undefined) {
                let promises = [];
                promises.push(app.db.killmails.updateMany({'involved.group_id': row.group_id}, {$addToSet: {'involved.category_id': row.category_id}}, {multi: true}));
                //promises.push(app.db.killmails_90.updateMany({'involved.group_id': row.group_id, 'involved.category_id': {$ne: row.category_id}}, {$addToSet: {'involved.category_id': row.category_id}}, {multi: true}));
                //promises.push(app.db.killmails_7.updateMany({'involved.group_id': row.group_id, 'involved.category_id': {$ne: row.category_id}}, {$addToSet: {'involved.category_id': row.category_id}}, {multi: true}));

                row.group_id = -1 * row.group_id;
                row.category_id = -1 * row.category_id;

                promises.push(app.db.killmails.updateMany({'involved.group_id': row.group_id}, {$addToSet: {'involved.category_id': row.category_id}}, {multi: true}));
                //promises.push(app.db.killmails_90.updateMany({'involved.group_id': row.group_id, 'involved.category_id': {$ne: row.category_id}}, {$addToSet: {'involved.category_id': row.category_id}}, {multi: true}));
                //promises.push(app.db.killmails_7.updateMany({'involved.group_id': row.group_id, 'involved.category_id': {$ne: row.category_id}}, {$addToSet: {'involved.category_id': row.category_id}}, {multi: true}));

                await app.sleep(10);
                await app.waitfor(promises);
            }
        }
    } while (row != null);
}