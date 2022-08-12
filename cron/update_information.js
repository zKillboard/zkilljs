'use strict';

module.exports = {
    exec: f,
    span: 1
}

var adds = ['character_id', 'corporation_id', 'alliance_id', 'group_id', 'category_id', 'constellation_id', 'region_id', 'creator_corporation_id', 'executor_corporation_id', 'creator_id', 'ceo_id', 'types', 'groups', 'systems', 'constellations', 'star_id'];
var maps = {
    'creator_corporation_id': 'corporation_id',
    'executor_corporation_id': 'corporation_id',
    'creator_id': 'character_id',
    'ceo_id': 'character_id',
    'types': 'item_id',
    'groups': 'group_id',
    'systems': 'solar_system_id',
    'constellations': 'constellation_id'
};


var urls = {
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
    //'war_id': '/v1/wars/:id/'
};
var types = Object.keys(urls);

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


const set = new Set();
var firstRun = true;

let esi_error = 0;

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    if (firstRun) {
        firstRun = false;
        for (const typeValue of types) populateSet(app, typeValue);
    }

    await app.sleep(1000);
    while (app.no_api && set.size > 0) await app.sleep(1000);
}

async function populateSet(app, typeValue) {
    let fetched = 0;
    try {
        const fullStop = app.no_api || app.no_parsing || app.no_stats || app.bailout;
        const dayAgo = (fullStop ? 1 : (Math.floor(Date.now() / 1000) - 86400));

        let rows = await app.db.information.find({
            last_updated: {
                $lt: dayAgo
            },
            type: typeValue
        }).sort({
            last_updated: 1
        }).limit(1000); // Limit so we reset this query often

        while (await rows.hasNext()) {
            if (app.bailout == true || app.no_api == true) break;

            // limit to 10/s 
            /*if (typeValue == 'character_id' || typeValue == 'corporation_id' || typeValue == 'alliance_id') await app.sleep(100);
            else await app.sleep(1000);*/
            await app.sleep(100);
            var p = fetch(app, await rows.next());
            let wait = 20;
            while (set.size > 100) {
                wait--;
                await app.sleep(1);
            }
            await app.sleep(wait);
            if (esi_error > 0) await app.sleep(1000);
            fetched++;
        }

        // Wait for all calls to finish and return
        while (set.size > 0) {
            await app.sleep(1);
        }
    } catch (e) {
        console.log(e, 'dropped on ' + typeValue);
    } finally {
        if (fetched == 0) await app.sleep(1000);
        populateSet(app, typeValue);
    }
}

async function fetch(app, row) {
    try {
        const orow = row;
        set.add(row);

        let now = Math.floor(Date.now() / 1000);

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
                await app.db.information.updateOne(row, {$set : { last_updated: now, inactive: true }});
                return;  // nothing to update, move on
            }
        }

        await app.redis.hset('zkilljs:info:' + row.type, row.id, JSON.stringify(row));

        let url = process.env.esi_url + urls[row.type].replace(':id', row.id);
        await app.util.assist.esi_limiter(app);
        let res = await app.phin({
            url: url,
            headers: {
                // 'If-None-Match': (row.type == 'alliance_id' ? '' : row.etag || '')
            }
        });
        await app.util.assist.esi_result_handler(app, res);

        if (res.statusCode != 200 && res.statusCode != 304) {
            esi_err_log(app);
        }

        switch (res.statusCode) {
        case 200:
            var body = JSON.parse(res.body);
            body.inactive = false;
            body.last_updated = now;
            body.etag = res.headers.etag;
            if (row.type == 'war_id') {
                // Special case for wars, something with this war changed
                body.check_wars = true;
            }

            // Characters, corporations, and alliances don't always have alliance or faction id set
            if (row.type == 'character_id' || row.type == 'corporation_id' || row.type == 'alliance_id') {
                body.alliance_id = body.alliance_id || 0;
                body.faction_id = body.faction_id || 0;
                await app.sleep(1000);
            }

            await app.redis.hset('zkilljs:info:' + row.type, row.id, JSON.stringify(body));
            await app.db.information.updateOne(row, {
                $set: body
            });

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

            var searchname = row.name;
            if (row.type =='character_id' && row.corporation_id == 1000001) searchname = searchname + ' (recycled)';
            else if ((row.type == 'corporation_id' || row.type == 'alliance_id') && row.membercount == 0) searchname = searchname + ' (closed)';

            await app.mysql.query('replace into autocomplete values (?, ?, ?, ?)', [row.type, row.id, searchname, row.ticker]);
            return true;
            break;
        case 304: // ETAG match
            await app.db.information.updateOne(row, {                $set: {
                    last_updated: now
                }
            });
            break;
        case 404:
            await app.db.information.updateOne(row, {
                $set: {
                    last_updated: now
                }
            });
            break;
        case 401:
            if (app.no_api == false) {
                app.no_api = true;
                //setTimeout(function() { clear_no_api(app); }, 300000 + (Date.now() % 60000));
                console.log("http code 401 received, we've been banned?");
            }            
            break;
        case 420:
            if (app.no_api == false) {
                app.no_api = true;
                setTimeout(function() {clear_no_api(app);}, 1000 + (Date.now() % 60000));
                console.log("420'ed in information: " + row.type + " " + row.id);
            }
            break;
        case 500:
            console.log(row.type, row.id, '500 received');
            break;
        case 502:
        case 503:
        case 504:
            await app.sleep(1000);
            break; // Try again later
        default:
            console.log(row, 'Unhandled error code ' + res.statusCode);
        }

        return false;
    } catch (e) {
        console.log(e);
        await app.db.information.updateOne(row, {
            $set: {
                last_updated: (Math.floor(Date.now() / 1000) - 86100)
            }
        });
    } finally {
        set.delete(row);
    }
}

function clear_no_api(app) {
    app.no_api = false;
}

function esi_err_log(app) {
    esi_error++;
    setTimeout(function () {
        esi_error--;
    }, 1000);
}