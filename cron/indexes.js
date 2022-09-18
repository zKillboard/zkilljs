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
            app.db[collections[i].name] = await app.db.collection(collections[i].name);
        }

        app.zindexes_added = true;
    }
}

async function applyIndexes(app) {
    await create_collection(app, 'scopes');
    await createIndex(app, app.db.collection('scopes'), {character_id: 1, scope: 1}, {unique: true});
    await createIndex(app, app.db.collection('scopes'), {scope: 1, last_updated: 1}, {sparse: true});

    await create_collection(app, 'datacache');
    await createIndex(app, app.db.collection('datacache'), {requrl: 1}, {unique: true});
    await createIndex(app, app.db.collection('datacache'), {epoch: 1});

    await create_collection(app, 'killhashes');
    await createIndex(app, app.db.collection('killhashes'), {killmail_id: 1, hash: 1}, {unique: true});
    await createIndex(app, app.db.collection('killhashes'), {status: 1});
    await createIndex(app, app.db.collection('killhashes'), {reset: 1}, {sparse: true});
    await createIndex(app, app.db.collection('killhashes'), {status: 1, killmail_id: -1});
    await createIndex(app, app.db.collection('killhashes'), {status: 1, sequence: -1});
    await createIndex(app, app.db.collection('killhashes'), {status: 1, failure_reason: 1}, {sparse: true});

    await create_collection(app, 'statistics');
    await createIndex(app, app.db.collection('statistics'), {id: 1}, {});
    await createIndex(app, app.db.collection('statistics'), {type: 1, id: 1}, {unique: true});
    await createIndex(app, app.db.collection('statistics'), {type: 1, update_alltime: 1}, {});
    await createIndex(app, app.db.collection('statistics'), {type: 1, update_recent: 1}, {});
    await createIndex(app, app.db.collection('statistics'), {type: 1, update_week: 1}, {});
    await createIndex(app, app.db.collection('statistics'), {update_alltime: 1}, {});
    await createIndex(app, app.db.collection('statistics'), {update_recent: 1}, {});
    await createIndex(app, app.db.collection('statistics'), {update_week: 1}, {});
    await createIndex(app, app.db.collection('statistics'), {reset: 1}, {sparse: true});
    await createIndex(app, app.db.collection('statistics'), {'alltime.last_sequence': 1}, {sparse: true});
    await createIndex(app, app.db.collection('statistics'), {'recent.last_sequence': 1}, {sparse: true});
    await createIndex(app, app.db.collection('statistics'), {'week.last_sequence': 1}, {sparse: true});
    await createIndex(app, app.db.collection('statistics'), {'alltime.update_top': 1}, {sparse: true});
    await createIndex(app, app.db.collection('statistics'), {'recent.update_top': 1}, {sparse: true});
    await createIndex(app, app.db.collection('statistics'), {'week.update_top': 1}, {sparse: true});

    await create_collection(app, 'prices');
    await createIndex(app, app.db.collection('prices'), {item_id: 1}, {unique: true});
    await createIndex(app, app.db.collection('prices'), {waiting: 1}, {});
    await createIndex(app, app.db.collection('prices'), {last_fetched: 1}, {});

    await create_collection(app, 'information');
    await createIndex(app, app.db.collection('information'), {type: 1});
    await createIndex(app, app.db.collection('information'), {id: 1}); 
    await createIndex(app, app.db.collection('information'), {type: 1, id: 1}, {unique: true});
    await createIndex(app, app.db.collection('information'), {type: 1, last_updated: 1}, {});
    await createIndex(app, app.db.collection('information'), {last_updated: 1}, {});
    await createIndex(app, app.db.collection('information'), {type: 1, alliance_id: 1}, {sparse: true}); // For determining alliance member counts
    await createIndex(app, app.db.collection('information'), {update_search: 1}, {sparse: true}); // for determing if need to update autocomplete search
    await createIndex(app, app.db.collection('information'), {update_name: 1}, {sparse: true}); // for determing if need to update autocomplete search
    await createIndex(app, app.db.collection('information'), {type: 1, last_updated: 1}, {});
    await createIndex(app, app.db.collection('information'), {type: 1, waiting: 1}, {});
    await createIndex(app, app.db.collection('information'), {type: 1, last_updated: 1, waiting: 1}, {}); 
    await createIndex(app, app.db.collection('information'), {last_member_count_updated: 1}, {sparse: true}); 

    await createIndex(app, app.db.collection('information'), {type: 1, id: 1}, {unique: true});
    await createIndex(app, app.db.collection('information'), {last_updated: 1}, {});
    await createIndex(app, app.db.collection('information'), {type: 1, last_updated: 1}, {});
    await createIndex(app, app.db.collection('information'), {check_wars: 1}, {sparse: true});    
    await createIndex(app, app.db.collection('information'), {type: 1, solar_system_id: 1}, {sparse: true});    

    await createIndex(app, app.db.collection('killhashes'), {killmail_id: 1, hash: 1}, {unique: true});
    await createIndex(app, app.db.collection('killhashes'), {status: 1});
    await createIndex(app, app.db.collection('killhashes'), {status: 1, sequence: -1});

    await createIndex(app, app.db.collection('prices'), {item_id: 1}, {unique: true});
    await createIndex(app, app.db.collection('prices'), {waiting: 1});

    await createIndex(app, app.db.collection('rawmails'), {killmail_id: 1}, {unique: true});

    await create_collection(app, 'settings');
    await createIndex(app, app.db.collection('settings'), {key: 1}, {unique: true});
    
    await create_killmail_collection(app, 'killmails');    
    await create_killmail_collection(app, 'killmails_7');
    await create_killmail_collection(app, 'killmails_90');
}

async function create_collection(app, name) {
    try {
        await app.db.createCollection(name);
    } catch (e) {
        if (e.code == 48) return; // all good, collection already exists and we want that anyway
        throw e;
    }
}

let informed = false;
async function createIndex(app, collection, index, options = {}) {
    let previous_index_count = Object.keys(await collection.indexInformation()).length;
    let creation = app.wrap_promise(collection.createIndex(index, options));
    let timeout = app.sleep(10);
    await Promise.race([creation, timeout]);
    if (!creation.isFinished()) {
        if (!informed) {
            console.log('Ensuring all indexes exist.')
            informed = true;
        }
    }
    await creation;
    let new_index_count = Object.keys(await collection.indexInformation()).length
    if (new_index_count != previous_index_count) {
        console.log('Created index:', index, 'with options', options);
        informed = true;
    }
}

async function create_killmail_collection(app, collection) {
    await create_collection(app, collection);

    await createIndex(app, app.db.collection(collection), {padhash: 1}, {});
    await createIndex(app, app.db.collection(collection), {killmail_id: 1}, {unique: true});
    await createIndex(app, app.db.collection(collection), {sequence: 1}, {unique: true});
    await createIndex(app, app.db.collection(collection), {year: 1, month: 1, day: 1}, {});
    await createIndex(app, app.db.collection(collection), {epoch: 1}, {});
    await createIndex(app, app.db.collection(collection), {status: 1}, {sparse: true});


    for (let i of ind) {
        var key = 'involved.' + i;

        await createIndex(app, app.db.collection(collection), {[key] : 1});
        await createIndex(app, app.db.collection(collection), {[key] : 1, sequence: 1});
        await createIndex(app, app.db.collection(collection), {[key] : 1, killmail_id: -1});
    }
}

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
    'label',
];
