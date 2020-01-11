'use strict';


var first = true;

async function f(app) {
    if (first) {
        await applyIndexes(app);
        first = false;
    }

}

var bg = {};

async function applyIndexes(app) {
    var index = {
        sequence: 1,
        labels: 1

    };
    await createIndex(app.db.killmails, index, bg);
    for (let i of ind) {
        var key = 'involved.' + i;
        index = {};
        index[key] = 1;
        await createIndex(app.db.killmails, index, bg);
        
        index = {
            sequence: 1,
        };
        index[key] = 1;
        await createIndex(app.db.killmails, index, bg);
        
        index = {
            stats: 1,
            sequence: 1,
        };
        var key = 'involved.' + i;
        index[key] = 1;
        await createIndex(app.db.killmails, index, bg);
    }
    console.log('done');
}

async function createIndex(collection, index, options) {
    console.log("Creating", index, options);
    await collection.createIndex(index, options);
}

//'labels'

var ind = [
    'character_id',
    'corporation_id',
    'alliance_id',
    'faction_id',
    'item_id',
    'group_id',
    'category_id',
    'war_id',
    'location_id',
    'solar_system_id',
    'constellation_id',
    'region_id',
];

module.exports = f;
