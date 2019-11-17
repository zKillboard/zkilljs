'use strict';

var adds = ['character_id', 'corporation_id', 'alliance_id', 'group_id', 'category_id', 'constellation_id', 'region_id', 'creator_corporation_id', 'executor_corporation_id', 'creator_id', 'ceo_id', 'types', 'groups', 'systems', 'constellations'];
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
    'character_id': '/v4/characters/:id/',
    'corporation_id': '/v4/corporations/:id/',
    'alliance_id': '/v3/alliances/:id/',
    'category_id': '/v1/universe/categories/:id/',
    'solar_system_id': '/v4/universe/systems/:id/',
    'constellation_id': '/v1/universe/constellations/:id/',
    'region_id': '/v1/universe/regions/:id/',
    'war_id': '/v1/wars/:id/'
};
var types = Object.keys(urls);

const set = new Set();
var firstRun = true;

let esi_error = 0;

async function f(app) {
    if (firstRun) {
        firstRun = false;
        populateSet(app);
    }

    await app.sleep(1000);
    while (app.bailout && set.size > 0) await app.sleep(1000);
}

async function populateSet(app) {
    let fetched = 0;
    try {
        const fullStop = app.bailout || app.no_parsing || app.no_stats;
        const dayAgo = (fullStop ? 1 : (Math.floor(Date.now() / 1000) - 86400));

        let rows = await app.db.information.find({
            last_updated: {
                $lt: dayAgo
            }
        }).sort({
            last_updated: 1
        }).limit(1000); // Limit so we reset this query often

        while (await rows.hasNext()) {
            if (app.bailout == true) break;

            fetch(app, await rows.next());
            let wait = 20;
            while (set.size > 10) {
                wait--;
                await app.sleep(1);
            }
            await app.sleep(wait);
            if (esi_error > 0) await app.sleep(1000);
            fetched++;
        }
        while (set.size > 0) {
            await app.sleep(1);
        }
    } catch (e) {
        console.log(e);
    } finally {
        if (fetched == 0) await app.sleep(1000);
        populateSet(app);
    }
}

async function fetch(app, row) {
    try {
        set.add(row);

        if (urls[row.type] == undefined) {
            console.log('Unmatched information: ', row);
            return;
        }

        let url = app.esi + urls[row.type].replace(':id', row.id);
        let res = await app.phin({
            url: url,
            headers: {
                'If-None-Match': row.etag || ''
            }
        });

        if (res.statusCode != 200 && res.statusCode != 304) {
            esi_err_log(app);
        }

        let now = Math.floor(Date.now() / 1000);
        switch (res.statusCode) {
        case 200:
            var body = JSON.parse(res.body);
            body.last_updated = now;
            body.etag = res.headers.etag;
            if (row.type == 'war_id') {
                // Special case for wars, something with this war changed
                body.check_wars = true;
            }
            await app.db.information.updateOne(row, {
                $set: body
            });
            //if (row.name != body.row) console.log('Added ' + row.type + ' ' + row.id + ' ' + body.name);
            app.zincr('esi_fetched');

            let keys = Object.keys(body);
            for (let key of keys) {
                let value = body[key];

                if (adds.includes(key)) {
                    let type = maps[key] || key;
                    if (type == null) die("null type");
                    if (Array.isArray(value)) {
                        for (let v of value) {
                            await app.util.entity.add(app, type, v, false);
                        }
                    } else {
                        await app.util.entity.add(app, type, value, false);
                    }
                }
            }

            return true;
            break;
        case 304: // ETAG match
            await app.db.information.updateOne(row, {
                $set: {
                    last_updated: now
                }
            });
             app.zincr('esi_304');
            break;
        case 404:
            await app.db.information.updateOne(row, {
                $set: {
                    last_updated: now
                }
            });
            break;
        case 420:
            app.bailout = true;
            setTimeout(() => {
                app.bailout = false;
            }, 1000 + (Date.now() % 60000));
            console.log("420'ed", row);
            break;
        case 500:
        case 502:
        case 504:
            break; // Try again later
        default:
            console.log(row, 'Unhandled error code ' + res.statusCode);
        }

        return false;
    } catch (e) {
        console.log(e)
    } finally {
        set.delete(row);
    }
}

module.exports = f;

function esi_err_log(app) {
    esi_error++;
    app.zincr('esi_error');
    setTimeout(function () {
        esi_error--;
    }, 1000);
}
