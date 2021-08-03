'use strict';

var info_cache = {};
var wait_cache = {};

const set = new Set(); // cache for keeping track of what has been inserted to information
setInterval(function () {
    console.log('clearing entity info caches');
    set.clear();
    info_cache = {};
    wait_cache = {};
}, 900000);

const entity = {
    async add(app, type, id, wait = false) {
        // check that type is string
        // check that id is numeric
        if (typeof type != 'string') throw 'type is not a string: ' + type + ' ' + id;
        if (typeof id != 'number') throw 'id is not a number: ' + type + ' ' + id;

        if (id <= 0) return;
        const key = type + ':' + id;
        if (set.has(key)) return;

        let row = await app.db.information.findOne({
            type: type,
            id: id
        });
        if (row == null || row.length == 0) {
            try {
                await app.db.information.updateOne({
                    type: type,
                    id: id
                }, {
                    $set: {
                        type: type,
                        id: id,
                        name: type + ' ' + id,
                        last_updated: 0
                    }
                }, {
                    upsert: true
                });
            } catch (e) {
                //console.log(e);
            }
        }

        set.add(key);
        if (wait) await entity.wait(app, type, id);
    },

    async wait(app, type, id) {
        let count = 0;
        while (true) {
            let row = await app.db.information.findOne({
                type: type,
                id: id
            });
            if (row != null && row.last_updated != 0) return;
            if (row == null) {
                console.log('Adding entity: ', type, id);
                await entity.add(app, type, id, false);
            }

            if (app.bailout) throw 'bailing out!';
            await app.sleep(1000);
            count++;
            // if (count > 10) throw 'Taking too long with this wait for ' + type + ' ' + id;
            //console.log('entity.wait: Waiting on ' + type + ' ' + id);
        }
    },

    async info(app, type, id, wait = false) {
        if (id == undefined) throw 'id cannot be undefined';

        const key = type + '_' + id;
        if (info_cache[key] != undefined) return info_cache[key];

        if (wait) {
            if (wait_cache[key] == undefined) await entity.wait(app, type, id);
            wait_cache[key] = true;
        }

        let row = await app.redis.hget('zkilljs:info:' + type, id);
        if (row != null) {
            row = JSON.parse(row);
        } 

        if ((row == undefined || row == null) || row.type == undefined || row.id == undefined) {
            row = await app.db.information.findOne({
                type: type,
                id: id
            });
        }
        info_cache[key] = row;
        return row;
    },

    async info_field(app, type, id, field) {
        const row = await entity.info(type, id, true);
        return row[field];
    }
}

module.exports = entity;