'use strict';

module.exports = {
    exec: f,
    span: 1
}

let in_progress = {};

let item_cache = {};
let group_cache = {};
let category_cache = {};
let involved_add_cache = {};
let added_cache = {};
let price_cache = {};
let universe_cache = {};
let padhash_ship_2_group = {};
function clear_caches() {
    item_cache = {};
    group_cache = {};
    category_cache = {};
    involved_add_cache = {};
    added_cache = {};
    price_cache = {};
    universe_cache = {};
    padhash_ship_2_group = {};
}
setInterval(clear_caches, 60000);


const no_solo_ships = [29, 31, 237];

let firstRun = true;
let sequence = undefined;

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    if (sequence == undefined) {
        // get the highest sequence
        let result = await app.db.killmails.find().sort({sequence: -1}).limit(1).toArray();
        if (result.length == 0) sequence = 0;
        else sequence = result[0].sequence;
        console.log('Sequence starting at:', sequence);
    }

    await app.util.asyncpool.go(app.db.killhashes.find({status: 'fetched'}).sort({killmail_id: -1}).batchSize(100), parse_mail,  app.util.assist.continue_simul_go, 5, app);
}

const max_concurrent = Math.max(1, (parseInt(process.env.max_concurrent_fetched) | 5));
async function max() {
    if (this.dbstats.pending > 100) return 1;
    return max_concurrent;
}

async function parse_mail(killhash) {
    let app = this;

    let killmail = {};
    const now = Math.floor(Date.now() / 1000);

    if (in_progress[killhash.killmail_id] !== undefined) return;

    try {
        in_progress[killhash.killmail_id] = true;

        const remove_alltime = app.db.killmails.removeOne({killmail_id: killhash.killmail_id});
        const remove_recent = app.db.killmails_90.removeOne({killmail_id: killhash.killmail_id});
        const remove_week = app.db.killmails_7.removeOne({killmail_id: killhash.killmail_id});

        killmail.killmail_id = killhash.killmail_id;
        killmail.hash = killhash.hash;

        const rawmail = await app.db.rawmails.findOne({killmail_id: killhash.killmail_id});
        if (rawmail == null) {
            // wth?
            await app.db.killmails.removeOne({killmail_id: killhash.killmail_id});
            await app.db.rawmails.removeOne({killmail_id: killhash.killmail_id});
            await app.waitfor([remove_alltime, remove_recent, remove_week]);
            await app.db.killhashes.updateOne({_id: killhash._id}, {$set: {status: 'pending'}});
            return;
        }

        let km_date = new Date(rawmail.killmail_time);
        killmail.year = km_date.getFullYear();
        killmail.month = km_date.getMonth() + 1;
        killmail.day = km_date.getDate();
        killmail.epoch = Math.floor(km_date.getTime() / 1000);
        let km_date_str = app.util.price.format_date(km_date);

        let price_date = app.util.price.format_date(km_date);
        const ship_price = get_item_price(app, {item_type_id: rawmail.victim.ship_type_id, singleton: 0, quantity_destroyed: 1}, price_date, false);
        const item_prices = get_item_prices(app, rawmail.victim.items, price_date, false);

        let promises = [];
        const involved = {};
        promises.push(addInvolved(app, involved, rawmail.victim, true));
        for (let inv of rawmail.attackers) promises.push(addInvolved(app, involved, inv, false));

        let system = universe_cache['system_' + rawmail.solar_system_id];
        if (system == undefined) {
            system = await app.util.entity.info(app, 'solar_system_id', rawmail.solar_system_id, true);
            universe_cache['system_' + rawmail.solar_system_id] = system;
        }
        let constellation = universe_cache['const_' + system.constellation_id];
        if (constellation == undefined) {
            constellation = await app.util.entity.info(app, 'constellation_id', system.constellation_id, true);
            universe_cache['const_' + system.constellation_id] = constellation;
        }
        let region = universe_cache['region_' + constellation.region_id];
        if (region == undefined) {
            region = await app.util.entity.info(app, 'region_id', constellation.region_id, true);
            universe_cache['region_' + constellation.region_id] = region;
        }
        
        addTypeId(app, involved, 'solar_system_id', system.id);
        addTypeId(app, involved, 'constellation_id', constellation.id);
        addTypeId(app, involved, 'region_id', region.id);

        let location_id = undefined;
        if (rawmail.victim.position != undefined) {
            location_id = app.util.info.get_location_id(app, rawmail.solar_system_id, rawmail.victim.position);
        }

        if (rawmail.war_id != undefined) {
            addTypeId(app, involved, 'war_id', rawmail.war_id);
            await app.util.entity.add(app, 'war_id', rawmail.war_id);
        }

        const npc = isNPC(rawmail);
        const labels = [];

        if (npc === true) {
            labels.push('npc');
            labels.push('nostats');
        } else {
            labels.push('pvp');
            if (await isSolo(app, rawmail) === true) labels.push('solo');
        }
        if (rawmail.attackers.length >= 10) labels.push('10+');
        if (rawmail.attackers.length >= 100) labels.push('100+');
        if (rawmail.attackers.length >= 1000) labels.push('1000+');

        if (system.security_status >= 0.45) labels.push('highsec');
        if (system.security_status < 0.45 && system.security_status >= 0.05) labels.push('lowsec');
        if (system.security_status < 0.05 && region.id < 11000001) labels.push('nullsec');
        if (region.id >= 11000000 && region.id < 12000000) labels.push('w-space');
        if (region.id >= 12000000 && region.id < 13000000) labels.push('abyssal');
        if (region.id >= 12000000 && region.id < 13000000 && !npc) labels.push('abyssal-pvp');

        let item_prices_total = await item_prices;
        let ship_price_total = await ship_price;

        killmail.total_value = Math.round(parseFloat(ship_price_total) + parseFloat(item_prices_total));
        if (isNaN(killmail.total_value)) {
            console.log('isNaN on killmail ' + killhash.killmail_id);
            return await app.sleep(1000);
        }

        if (killmail.total_value >= 10000000000) labels.push('bigisk');
        if (killmail.total_value >= 100000000000) labels.push('extremeisk');
        if (killmail.total_value >= 1000000000000) labels.push('insaneisk');

        killmail.stats = (labels.indexOf('pvp') > -1);
        killmail.involved_cnt = rawmail.attackers.length;

        await app.waitfor(promises);
        if (location_id != undefined) {
            location_id = await location_id;
            involved.location_id = [];
            involved.location_id.push(location_id);
        }

        sequence++;
        killmail.sequence = sequence;
        involved.label = labels;
        killmail.involved = involved;

        await app.waitfor([remove_alltime, remove_recent, remove_week]);

        await app.db.killmails.insertOne(killmail);
        if (killmail.epoch > (now - (90 * 86400))) await app.db.killmails_90.insertOne(killmail);
        if (killmail.epoch > (now - (7 * 86400))) await app.db.killmails_7.insertOne(killmail);

        await app.db.killhashes.updateOne(killhash, {$set: {status: 'parsed', sequence: killmail.sequence}});
        
        app.util.ztop.zincr(app, 'killmail_process_parsed');

        // Publish after killhash record has been updated, even publish older killmails if we're not doing too much
        if (killmail.epoch > (now - (7 * 86400)) || app.dbstats.total < 1000) await app.redis.rpush('publishkillfeed', killmail.killmail_id);
    } catch (e) {
        console.log('ERROR', killhash, '\n', e);
        await app.db.killhashes.updateOne(killhash, {$set: {status: 'parse-error'}});
    } finally {
        killmail = null; // memory leak protection
        delete in_progress[killhash.killmail_id];
    }
}

async function addInvolved(app, object, involved, is_victim) {
    for (let type in involved) {
        if (type.substr(-3, 3) != '_id') continue;

        const id = involved[type];
        if (type == 'weapon_type_id') {
            if (involved_add_cache['item_id:' + id] == true) continue;
            await app.util.entity.add(app, 'item_id', id);
            involved_add_cache['item_id:' + id] = true;
            continue;
        }
        if (type == 'ship_type_id') type = 'item_id';

        if (involved_add_cache[type + ':' + id] != true) {
            await app.util.entity.add(app, type, id);
            involved_add_cache[type + ':' + id] = true;
        }
        addTypeId(app, object, type, (is_victim ? -1 * id : id));

        if (type == 'item_id') {
            let item = item_cache[id]; 
            if (item == undefined) {
                item = await app.util.entity.info(app, type, id, true);
                item_cache[id] = item;
            }
            if (item && item.group_id) {
                let group = group_cache[item.group_id];
                if (group == undefined) {
                    group = await app.util.entity.info(app, 'group_id', item.group_id, true);
                    group_cache[item.group_id] = group;
                }
                addTypeId(app, object, 'group_id', (is_victim ? -1 * item.group_id : item.group_id));
                if (group && group.category_id) addTypeId(app, object, 'category_id', (is_victim ? -1 * group.category_id : group.category_id));
            }
        }
    }
}

function addTypeId(app, object, type, id) {
    if (id == undefined) throw 'cannot add an undefined id';
    if (id == 0) throw 'cannot add an id of 0';

    if (object[type] == undefined) object[type] = [];
    if (object[type].indexOf(id) == -1) object[type].push(id);
}

function isNPC(rawmail) {
    const victim = rawmail.victim;
    if (victim.character_id == undefined && victim.corporation_id > 1 && victim.corporation_id < 1999999) return true;

    for (let attacker of rawmail.attackers) {
        if (attacker.character_id > 3999999) return false;
        if (attacker.corporation_id > 1999999) return false;
    }

    return true;
}

async function isSolo(app, rawmail) {
    let ship_type_id = rawmail.victim.ship_type_id;
    if (ship_type_id == undefined) return false;

    // Rookie ships, shuttles, and capsules are not considered as solo
    let item = item_cache[ship_type_id];
    if (item == undefined) {
        item = await app.util.entity.info(app, 'item_id', ship_type_id, true);
        item_cache[ship_type_id] = item;
    }
    if (no_solo_ships.indexOf(item.group_id) != -1) return false;

    // Only ships can be solo'ed
    let group = group_cache[item.group_id];
    if (group == undefined) {
        group = await app.util.entity.info(app, 'group_id', item.group_id);
        group_cache[item.group_id] = item;
    }
    if (group.category_id != 6) return false;

    let numPlayers = 0;
    for (let attacker of rawmail.attackers) {
        if (attacker.character_id > 3999999) numPlayers++;
        if (numPlayers > 1) return false;

        ship_type_id = attacker.ship_type_id;
        if (ship_type_id == undefined) return false;

        item = item_cache[ship_type_id];
        if (item == undefined || item == null) {
            item = await app.util.entity.info(app, 'item_id', ship_type_id, true);
            item_cache[ship_type_id] = item;
        }
        if (item.group_id == undefined) return false;

        group = group_cache[item.group_id];
        if (group == undefined) {
            group = await app.util.entity.info(app, 'group_id', item.group_id);
            group_cache[item.group_id] = group;
        }
        if (group.id == 65) return false;
    }
    // Ensure that at least 1 player is on the kill so as not to count losses against NPC's
    return (numPlayers == 1);
}

async function get_item_prices(app, items, date, in_container = false) {
    let total = 0;
    let promises = [];

    for (let item of items) promises.push(get_item_price(app, item, date, in_container));

    for (let p of promises) total += await p;

    return total;
}

async function get_item_price(app, item, date, in_container) {
    if (added_cache[item.item_type_id] != true) {
        await app.util.entity.add(app, 'item_id', item.item_type_id);
        added_cache[item.item_type_id] = true;
    }

    let total = 0;
    if (item.items instanceof Array) {
        total += await get_item_prices(app, item.items, date, true);
    }

    if (item.singleton != 0 || in_container == true) {
        let item_info = item_cache[item.item_type_id];
        if (item_info == undefined || item_info.group_id == undefined) {
            item_info = await app.util.entity.info(app, 'item_id', item.item_type_id);
            item_cache[item.item_type_id] = item_info;
        }
        let group = group_cache[item_info.group_id];
        if (group == undefined || group.category_id == undefined) {
            group = (item_info.group_id == undefined ? undefined : await app.util.entity.info(app, 'group_id', item_info.group_id));
            group_cache[item_info.group_id] = group;
        }
        if (group != undefined) {
            let category = category_cache[group.category_id];
            if (category == undefined) {
                if (group.category_id == undefined) {
                    console.log(item);
                    console.log(group);
                }
                category = await app.util.entity.info(app, 'category_id', group.category_id);
                category_cache[group.category_id] = category;
            }
            if (category != undefined) {
                if (category.id == 9 && (item.singleton != 0 || in_container == true)) item.singleton = 2;
            }
        }
    }

    let cache_key = item.item_type_id + '-' + date;
    let item_price;
    if (item.singleton != 0) item_price = 0.01;
    else {
        item_price = price_cache[cache_key];
        if (item_price == undefined) {
            item_price = await app.util.price.get(app, item.item_type_id, date);
            price_cache[cache_key] = item_price;
        }
    }
    let qty = (item.quantity_dropped | 0) + (item.quantity_destroyed | 0);

    total += (qty * item_price);

    return total;
}

async function check_for_padding(app, rawmail) {
    let killmail_id = rawmail.killmail_id;
    let hash = rawmail.hash;

    let count = 0;
    for (let i = rawmail.killmail_id - 100; i <= rawmail.killmail_id; i++) {
        if (await app.db.killhashes.findOne({killmail_id: i, hash: hash}) != null) count++;
    }
    return count;
}