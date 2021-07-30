'use strict';


var first = true;

async function f(app) {
    if (first) {
        await applyIndexes(app);
        first = false;
    }

}

var bg = {background: true};

async function applyIndexes(app) {
    await app.db.createCollection('killhashes');
    await createIndex(app.db.killhashes, {killmail_id: 1, hash: 1}, {unique: true});
    await createIndex(app.db.killhashes, {status: 1}, {});

    await app.db.createCollection('statistics');
    await createIndex(app.db.statistics, {type: 1, id: 1}, {unique: true});
    await createIndex(app.db.collection('statistics'), {type: 1, update_alltime: 1}, {});
    await createIndex(app.db.collection('statistics'), {type: 1, update_recent: 1}, {});
    await createIndex(app.db.collection('statistics'), {type: 1, update_week: 1}, {});
    await createIndex(app.db.collection('statistics'), {'recent.last_sequence': 1}, {sparse: true});
    await createIndex(app.db.collection('statistics'), {'week.last_sequence': 1}, {sparse: true});
    await createIndex(app.db.collection('statistics'), {'alltime.update_top': 1}, {sparse: true});
    await createIndex(app.db.collection('statistics'), {'recent.update_top': 1}, {sparse: true});
    await createIndex(app.db.collection('statistics'), {'week.update_top': 1}, {sparse: true});

    await app.db.createCollection('prices');
    await createIndex(app.db.prices, {item_id: 1}, {unique: true});
    await createIndex(app.db.prices, {waiting: 1}, {});
    await createIndex(app.db.prices, {last_fetched: 1}, {});

    await app.db.createCollection('information');
    await createIndex(app.db.information, {type: 1});
    await createIndex(app.db.information, {id: 1}); 
    await createIndex(app.db.information, {type: 1, id: 1}, {unique: true});
    await createIndex(app.db.information, {type: 1, last_updated: 1}, {});
    await createIndex(app.db.information, {last_updated: 1}, {});
    await createIndex(app.db.information, {type: 1, alliance_id: 1}, {sparse: true}); // For determining alliance member counts

    await create_collection(app, 'killmails');
    await createIndex(app.db.collection('killmails'), {status: 1}, {sparse: true});
    await create_collection(app, 'killmails_7');
    await createIndex(app.db.collection('killmails_7'), {epoch: 1}, {});

    await create_collection(app, 'killmails_90');
    await createIndex(app.db.collection('killmails_90'), {epoch: 1}, {});

    await createIndex(app.db.collection('information'), {type: 1, id: 1}, {unique: true});
    await createIndex(app.db.collection('information'), {last_updated: 1}, {});
    await createIndex(app.db.collection('information'), {type: 1, last_updated: 1}, {});
    await createIndex(app.db.collection('information'), {check_wars: 1}, {sparse: true});    

    await createIndex(app.db.collection('killhashes'), {killmail_id: 1, hash: 1}, {unique: true});
    await createIndex(app.db.collection('killhashes'), {status: 1}, bg);

    await createIndex(app.db.collection('prices'), {item_id: 1}, {unique: true});
    await createIndex(app.db.collection('prices'), {waiting: 1}, bg);

    await createIndex(app.db.collection('rawmails'), {killmail_id: 1}, {unique: true});
    await createIndex(app.db.collection('killmails'), {killmail_id: 1}, {unique: true});

    await create_collection(app, 'settings');
    await createIndex(app.db.collection('settings'), {key: 1}, {unique: true});
    
    console.log('done');
}

async function createIndex(collection, index, options) {
    console.log("Creating", index, options);
    await collection.createIndex(index, options);
}

async function create_collection(app, collection) {
    if (typeof app.db[collection] != 'undefined') return;
    console.log('Creating collection', collection);
    app.db[collection] = await app.db.createCollection(collection);
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
