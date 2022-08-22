'use strict';

module.exports = {
    exec: f,
    span: 1
}

const adds = [
    'character_id', 
    'corporation_id', 
    'alliance_id', 
    'group_id', 
    'category_id', 
    'constellation_id', 
    'region_id', 
    'creator_corporation_id', 
    'executor_corporation_id', 
    'creator_id', 'ceo_id', 
    'types', 
    'groups', 
    'systems', 
    'constellations', 
    'star_id'
];

const maps = {
    'creator_corporation_id': 'corporation_id',
    'executor_corporation_id': 'corporation_id',
    'creator_id': 'character_id',
    'ceo_id': 'character_id',
    'types': 'item_id',
    'groups': 'group_id',
    'systems': 'solar_system_id',
    'constellations': 'constellation_id'
};


const urls = {
    'item_id': '/v3/universe/types/:id/',
    'group_id': '/v1/universe/groups/:id/',
    'character_id': '/v5/characters/:id/',
    'corporation_id': '/v4/corporations/:id/',
    'alliance_id': '/v4/alliances/:id/',
    'category_id': '/v1/universe/categories/:id/',
    'solar_system_id': '/v4/universe/systems/:id/',
    'constellation_id': '/v1/universe/constellations/:id/',
    'region_id': '/v1/universe/regions/:id/',
    'star_id': '/v1/universe/stars/:id/',
    'war_id': '/v1/wars/:id/'
};
const types = Object.keys(urls);

const types_dependant_on_server_version = ['item_id', 'group_id', 'category_id', 'solar_system_id', 'constellation_id', 'region_id'];

/*
 Meta 1-4 is tech 1, meta 5 is tech 2, meta 6-7 is storyline, meta 8 is faction, meta 10 is abyss, meta 11 to 14 is officer
 Zifrian — Today at 4:40 PM
@Squizz Caphinator moving to this channel - on using an attributeID, 1692 seems to give the new metaGroupID
However, T1 and T2 that value is null in the SDE
null - T1-T2
3 - Storyline
4 - Faction/Navy (Green)
5 - Officer (purple)
6 - Deadsace (Blue)
Squizz Caphinator — Today at 4:41 PM
hrm, so maybe use 1692 if present, and otherwise 633
*/

let concurrent = 0;
let firstRun = true;

async function f(app) {
    while (app.zinitialized != true) await app.sleep(100);
    
    if (firstRun) {
        firstRun = false;
        for (const typeValue of types) populateSet(app, typeValue);
    }
}

async function populateSet(app, typeValue) {
    let fetched = 0;
    try {
        if (app.bailout == true || app.no_api == true) return;
        const dayAgo = app.now() - 86400;

        fetched += await iterate(app, await app.db.information.find({type: typeValue, last_updated: {$lt: dayAgo}, waiting: true}).sort({last_updated: 1}).limit(10));
        if (fetched > 0) await app.sleep(1000); // allow things to wait to maybe add more for us to wait on... 
        else fetched += await iterate(app, await app.db.information.find({type: typeValue, last_updated: {$lt: dayAgo}}).sort({last_updated: 1}).limit(10));
    } catch (e) {
        console.log(e, 'dropped on ' + typeValue);
    } finally {
        if (fetched == 0) await app.sleep(1000);
        populateSet(app, typeValue);
    }
}

async function iterate(app, iterator) {
    let fetched = 0;
    let promises = [];
    
    while (await iterator.hasNext()) {
        if (app.bailout == true || app.no_api == true) break;
        const row = await iterator.next();
        if (row.waiting == true) console.log('Fetching entity:', row.type, row.id);

        if (row.type == 'war_id') await app.sleep(15000); // war calls limited to 4 per minute as too many could affect the cluster

        while (concurrent >= app.rate_limit) await app.sleep(10);

        concurrent++;
        promises.push(fetch(app, row));
        fetched++;
    }

    // Wait for all calls to finish and return
    await app.waitfor(promises);
    return fetched;
}
 
async function fetch(app, row) {
    try {
        const orow = row;
        let now = Math.floor(Date.now() / 1000);

        if (row.no_fetch === true) {
            await app.db.information.updateOne(row, {$set: {last_updated: now}});
            return;
        }

        let dependant_on_server_version = (types_dependant_on_server_version.indexOf(row.type) >= 0);        
        if (row.last_updated == 0 && dependant_on_server_version && row.server_version == app.server_version) {
            await app.db.information.updateOne(row, {$set: {last_updated: now}});
            return;
        }

        if (row.last_updated > 0 && (row.type == 'character_id' || row.type == 'corporation_id' || row.type == 'alliance_id')) {
            // Do they have a recent killmail?
            let recent_match = {}
            recent_match['involved.' + row.type] = row.id;
            let recent_count = await app.db.killmails_90.countDocuments(recent_match);
            if (recent_count == 0) {
                recent_match['involved.' + row.type] = -1 * row.id;
                recent_count = await app.db.killmails_90.countDocuments(recent_match);
            }
            if (recent_count == 0) {
                await app.db.information.updateOne(row, {$set : { last_updated: now, inactive: true}, $unset: {alliance_id: 1, faction_id: 1}});
                return;  // nothing to update, move on
            }
        }

        let url = process.env.esi_url + urls[row.type].replace(':id', row.id);
        let res = await app.phin({url: url, timeout: 15000});

        switch (res.statusCode) {
        case 200:
            let body = JSON.parse(res.body);
            body.inactive = false;
            body.last_updated = now;
            body.etag = res.headers.etag;
            body.waiting = false;
            if (dependant_on_server_version) body.server_version = app.server_version;

            if (row.type == 'war_id') {
                // Special case for wars, something with this war changed
                let total_kills = (body.aggressor.ships_killed || 0) + (body.defender.ships_killed || 0);
                if ((row.total_kills || 0) != total_kills) {
                    body.total_kills = total_kills;
                    body.check_wars = true;
                }
            } else {
                body.update_search = true; // update autocomplete name
            }

            // Characters, corporations, and alliances don't always have alliance or faction id set
            if (row.type == 'character_id' || row.type == 'corporation_id' || row.type == 'alliance_id') {
                body.alliance_id = body.alliance_id || 0;
                body.faction_id = body.faction_id || 0;
            }

            // Just to prevent any accidental cross contamination
            body.type = row.type;
            body.id = row.id; 

            await app.db.information.updateOne(row, {$set: body});
            app.util.ztop.zincr(app, 'info_' + row.type);

            let keys = Object.keys(body);
            for (let key of keys) {
                let value = body[key];

                if (adds.includes(key)) {
                    let type = maps[key] || key;
                    if (type == null) {
                        console.log('Unmapped type: ' + type);
                        continue;
                    }
                    if (Array.isArray(value)) {
                        for (let v of value) {
                            await app.util.entity.add(app, type, v, false);
                        }
                    } else {
                        await app.util.entity.add(app, type, value, false);
                    }
                }
            }

            break;
        case 304: // ETAG match
            await app.db.information.updateOne(row, {$set: {last_updated: now}});
            break;
        case 404:
            if (row.type == 'character_id') {
                await app.db.information.updateOne(row, {$set: {no_fetch: true, update_name: true, last_updated: app.now(), corporation_id: 1000001}, $unset: {alliance_id: 1, faction_id: 1}});
            } else {
                await app.db.information.updateOne(row, {$set: {no_fetch: true, update_name: true, last_updated: now}});
            }
            break;
        // all of these codes are handled with a wait in the esi error handler
        case 401:
        case 420:
        case 500:
        case 502:
        case 503:
        case 504:
            await app.db.information.updateOne(row, {$set: {last_updated: (app.now() - 86100)}}); // Try again later
            break;
        default:
            console.log(row, 'Unhandled error code ' + res.statusCode);
        }
    } catch (e) {
        await app.db.information.updateOne(row, {$set: {last_updated: (app.now() - 86100)}});
        console.log(e);
    } finally {
        concurrent--;
    }
}