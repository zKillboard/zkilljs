'use strict';

var info_cache = {};

const set = new Set(); // cache for keeping track of what has been inserted to information
setInterval(function () {
    set.clear();
    info_cache = {};
}, 60000);

const entity = {
    async add(app, type, id, wait = false) {
        // check that type is string
        // check that id is numeric
        if (typeof type != 'string') throw 'type is not a string: ' + type + ' ' + id;
        if (typeof id != 'number') throw 'id is not a number: ' + type + ' ' + id;
        if (isNaN(id)) throw 'id is not a number: ' + type + ' ' + id;

        if (id <= 0) return;
        const key = type + '_' + id;
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
            let row = await app.db.information.findOne({type: type, id: id});
            if (row != null && row.last_updated != 0) return;
            if (row == null) {
                console.log('Adding entity: ', type, id);
                await entity.add(app, type, id, false);
            }

            await app.sleep(1000);
            count++;
            if (count > 10) console.log('Waiting on', type, id);
        }
    },

    async info(app, type, id, wait = false) {
        wait = true; // always waiting seems to be the better option when retrieving info
        if (id == undefined) {
            console.log(new Error().stack);
            throw '(id == undefined) is true!)';
        }

        const key = type + '_' + id;
        if (info_cache[key] != undefined) return info_cache[key];
        var first = true;

        do {
            const row = await app.db.information.findOne({type: type, id: id});
            if (row == null && wait == false) {
                console.log(new Error().stack);
                throw 'no such ' + type + ' ' + id;
            }
            if (row == null && wait == true) {
                await this.add(app, type, id, false);
            }
            if (row != null && (row.last_updated || 0) > 0) {
                info_cache[key] = row;
                set.add(key);
                return row;
            }
            if (wait == false) throw type + ' ' + id + ' not updated, yet wait is false';
            if (first) {
                await app.db.information.updateOne({type: type, id: id}, {$set: {waiting: true}});
                first = false;
            }
            await app.sleep(100);
        } while (true); // wait for it to be updated... 
    },

    async info_field(app, type, id, field) {
        const row = await entity.info(type, id, true);
        return row[field];
    }
}

module.exports = entity;