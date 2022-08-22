'use strict';

module.exports = {
    exec: f,
    span: 1
}

let first = true;

async function f(app) {
    if (first) {
        let success = false;
        do {
            try {
                await applyIndexes(app);
                success = true;
            } catch (e) {
                console.log(e);
                await app.sleep(1000);
                success = false;
            }
        } while (success == false);

        await applyIndexes(app);
        first = false;

        let collections = await app.db.listCollections().toArray();
        for (let i = 0; i < collections.length; i++) {
            console.log('Prepped', collections[i].name);
            app.db[collections[i].name] = await app.db.collection(collections[i].name);
        }

        app.zindexes_added = true;
        console.log('indexes verified')
    }
}

let bg = {background: true};

async function applyIndexes(app) {
    await create_collection(app, 'scopes');
    await createIndex(app.db.collection('scopes'), {character_id: 1, scope: 1}, {unique: true});
    await createIndex(app.db.collection('scopes'), {scope: 1, last_updated: 1}, {sparse: true});

    await create_collection(app, 'datacache');
    await createIndex(app.db.collection('datacache'), {requrl: 1}, {unique: true});
    await createIndex(app.db.collection('datacache'), {epoch: 1});

    await create_collection(app, 'killhashes');
    await createIndex(app.db.collection('killhashes'), {killmail_id: 1, hash: 1}, {unique: true});
    await createIndex(app.db.collection('killhashes'), {status: 1}, {});
    await createIndex(app.db.collection('killhashes'), {status: 1, failure_reason: 1}, {sparse: true});

    await create_collection(app, 'statistics');
    await createIndex(app.db.collection('statistics'), {id: 1}, {});
    await createIndex(app.db.collection('statistics'), {type: 1, id: 1}, {unique: true});
    await createIndex(app.db.collection('statistics'), {type: 1, update_alltime: 1}, {});
    await createIndex(app.db.collection('statistics'), {type: 1, update_recent: 1}, {});
    await createIndex(app.db.collection('statistics'), {type: 1, update_week: 1}, {});
    await createIndex(app.db.collection('statistics'), {update_alltime: 1}, {});
    await createIndex(app.db.collection('statistics'), {update_recent: 1}, {});
    await createIndex(app.db.collection('statistics'), {update_week: 1}, {});
    await createIndex(app.db.collection('statistics'), {'alltime.last_sequence': 1}, {sparse: true});
    await createIndex(app.db.collection('statistics'), {'recent.last_sequence': 1}, {sparse: true});
    await createIndex(app.db.collection('statistics'), {'week.last_sequence': 1}, {sparse: true});
    await createIndex(app.db.collection('statistics'), {'alltime.update_top': 1}, {sparse: true});
    await createIndex(app.db.collection('statistics'), {'recent.update_top': 1}, {sparse: true});
    await createIndex(app.db.collection('statistics'), {'week.update_top': 1}, {sparse: true});

    await create_collection(app, 'prices');
    await createIndex(app.db.collection('prices'), {item_id: 1}, {unique: true});
    await createIndex(app.db.collection('prices'), {waiting: 1}, {});
    await createIndex(app.db.collection('prices'), {last_fetched: 1}, {});

    await create_collection(app, 'information');
    await createIndex(app.db.collection('information'), {type: 1});
    await createIndex(app.db.collection('information'), {id: 1}); 
    await createIndex(app.db.collection('information'), {type: 1, id: 1}, {unique: true});
    await createIndex(app.db.collection('information'), {type: 1, last_updated: 1}, {});
    await createIndex(app.db.collection('information'), {last_updated: 1}, {});
    await createIndex(app.db.collection('information'), {type: 1, alliance_id: 1}, {sparse: true}); // For determining alliance member counts
    await createIndex(app.db.collection('information'), {update_search: 1}, {sparse: true}); // for determing if need to update autocomplete search

    await create_killmail_collection(app, 'killmails');
    await createIndex(app.db.collection('killmails'), {status: 1}, {sparse: true});
    
    await create_killmail_collection(app, 'killmails_7');
    await createIndex(app.db.collection('killmails_7'), {epoch: 1}, {});

    await create_killmail_collection(app, 'killmails_90');
    await createIndex(app.db.collection('killmails_90'), {epoch: 1}, {});

    await createIndex(app.db.collection('information'), {type: 1, id: 1}, {unique: true});
    await createIndex(app.db.collection('information'), {last_updated: 1}, {});
    await createIndex(app.db.collection('information'), {type: 1, last_updated: 1}, {});
    await createIndex(app.db.collection('information'), {check_wars: 1}, {sparse: true});    
    await createIndex(app.db.collection('information'), {type: 1, solar_system_id: 1}, {sparse: true});    

    await createIndex(app.db.collection('killhashes'), {killmail_id: 1, hash: 1}, {unique: true});
    await createIndex(app.db.collection('killhashes'), {status: 1}, bg);

    await createIndex(app.db.collection('prices'), {item_id: 1}, {unique: true});
    await createIndex(app.db.collection('prices'), {waiting: 1}, bg);

    await createIndex(app.db.collection('rawmails'), {killmail_id: 1}, {unique: true});
    await createIndex(app.db.collection('killmails'), {killmail_id: 1}, {unique: true});

    await create_killmail_collection(app, 'settings');
    await createIndex(app.db.collection('settings'), {key: 1}, {unique: true});
    
}

async function create_collection(app, name) {
    try {
        await app.db.createCollection(name);
    } catch (e) {
        if (e.code == 48) return; // all good, collection already exists and we want  that anyway
        throw e;
    }
}

async function createIndex(collection, index, options) {
    //console.log("Creating", index, options);
    await collection.createIndex(index, options);
}

async function create_killmail_collection(app, collection) {
    await create_collection(app, collection);

    var index = {
        sequence: 1,
        labels: 1
    };
    await createIndex(app.db.collection(collection), index, {background: true});
    var index = {
        killmail_id: -1,
        labels: 1
    };
    await createIndex(app.db.collection(collection), index, {background: true});
     var index = {
        labels: 1
    };
    await createIndex(app.db.collection(collection), index, {background: true});
        
    await createIndex(app.db.collection(collection), {padhash: 1}, {});
    await createIndex(app.db.collection(collection), {killmail_id: 1}, {unique: true});
    await createIndex(app.db.collection(collection), {sequence: 1}, {unique: true});
    await createIndex(app.db.collection(collection), index, bg);
    for (let i of ind) {
        var key = 'involved.' + i;
        index = {};
        index[key] = 1;
        await createIndex(app.db.collection(collection), index, bg);

        index = {
            sequence: 1,
        };
        index[key] = 1;
        await createIndex(app.db.collection(collection), index, bg);

        index = {
            killmail_id: -1
        };
        index[key] = 1;
        await createIndex(app.db.collection(collection), index, bg);
    }
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
