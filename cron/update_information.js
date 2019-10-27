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
    'region_id': '/v1/universe/regions/:id/'
};

async function f(app, iteration) {
    const dayAgo = Math.floor(Date.now() / 1000) - 86400;
    let now = Date.now();

    if (iteration >= urls.length) return;
    let types = Object.keys(urls);
    let type = types[iteration];

    if (type != undefined) await fetchType(app, type, dayAgo);
}

async function fetchType(app, type, dayAgo) {
    var promises = [];

    let rows = await app.db.information.find({
        type: type
    }).limit(100).sort({
        last_updated: 1
    }).toArray();

    for (let i = 0; i < rows.length; i++) {
        if (app.bailout == true) {
            console.log('update_information: bailing');
            break;
        }

        let row = rows[i];
        if (urls[row.type] == undefined) {
            console.log('Not mapped: ' + row.type);
            continue;
        }
        if (row.last_updated > dayAgo) continue;
        if (urls[row.type] === false) continue;


        let url = app.esi + urls[row.type].replace(':id', row.id);
        promises.push(app.fetch({
            url: url,
            headers: {
                'If-None-Match': row.etag || ''
            }
        }, parse, failed, row));
        await app.sleep(100);
    }

    await app.waitfor(promises);
}

async function parse(app, res, options) {
    try {
        let now = Math.floor(Date.now() / 1000);
        if (res.statusCode == 304) { // ETAG match
            await app.db.information.updateOne(options, {
                $set: {
                    last_updated: now
                }
            });
            return;
        }

        switch (res.statusCode) {
        case 200:
            var body = JSON.parse(res.body);
            body.last_updated = now;
            body.etag = res.headers.etag;
            await app.db.information.updateOne(options, {
                $set: body
            });
            if (options.name != body.name) console.log('Added ' + options.type + ' ' + options.id + ' ' + body.name);


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
        case 404:
            console.log(options, '404 ' + res.statusCode);
            await app.db.information.updateOne(options, {
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
            console.log("420'ed");
            break;
        case 502:
        case 504:
            //console.log(options, '5xx ' + res.statusCode);
            break; // Try again later
        default:
            console.log(options, 'Unhandled error code ' + res.statusCode);
        }
    } catch (e) {
        console.trace(e.stack);
    }
    return false;
}

async function failed(app, e, options) {
    console.log(e);
}

module.exports = f;