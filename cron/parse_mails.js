'use strict';

module.exports = f;

const no_solo_ships = [29, 31, 237];
const parsed = {
    $set: {
        status: 'parsed'
    }
};

let sequence = undefined;

const set = new Set();
var firstRun = true;

const sw = require('../util/StreamWatcher.js');
const match = {
    status: 'fetched'
};

async function f(app) {
    if (sequence === undefined) {
        let resultset = await app.db.killmails.find({}).sort({
            sequence: -1
        }).limit(1).toArray();
        sequence = (resultset.length == 0) ? 0 : resultset[0].sequence;
    }

    if (firstRun) {
        sw.start(app, app.db.killhashes, match, parse_mail, 50);
        firstRun = false;
    }
}

async function parse_mail(app, killhash) {
    try {
        let removeOne = app.db.killmails.removeOne({
            killmail_id: killhash.killmail_id
        });

        var killmail = {};
        killmail.killmail_id = killhash.killmail_id;
        killmail.hash = killhash.hash;

        const rawmail = await app.db.rawmails.findOne({
            killmail_id: killhash.killmail_id
        });
        if (rawmail == null) {
            // wth?
            console.log('marking as failed: ', killhash);
            await app.db.killmails.removeOne({
                killmail_id: killhash.killmail_id
            });
            await app.db.rawmails.removeOne({
                killmail_id: killhash.killmail_id
            });
            await app.db.killhashes.removeOne(killhash);
            return;
        }

        var km_date = new Date(rawmail.killmail_time);
        killmail.year = km_date.getFullYear();
        killmail.month = km_date.getMonth() + 1;
        killmail.day = km_date.getDate();
        killmail.epoch = Math.floor(km_date.getTime() / 1000);
        var km_date_str = app.util.price.format_date(km_date);

        const ship_price = app.util.price.get(app, rawmail.victim.ship_type_id, km_date_str);
        const item_prices = get_item_prices(app, rawmail.victim.items, km_date, false);

        let promises = [];
        const involved = {};
        promises.push(addInvolved(app, involved, rawmail.victim, true));
        for (let inv of rawmail.attackers) promises.push(addInvolved(app, involved, inv, false));

        const system = await app.util.entity.info(app, 'solar_system_id', rawmail.solar_system_id, true);
        const constellation = await app.util.entity.info(app, 'constellation_id', system.constellation_id, true);
        const region = await app.util.entity.info(app, 'region_id', constellation.region_id, true);

        addTypeId(app, involved, 'solar_system_id', system.id);
        addTypeId(app, involved, 'constellation_id', constellation.id);
        addTypeId(app, involved, 'region_id', region.id);

        if (rawmail.victim.position != undefined) {
            const location_id = await app.util.info.get_location_id(app, rawmail.solar_system_id, rawmail.victim.position);

            if (location_id != undefined) {
                involved.location_id = [];
                involved.location_id.push(location_id);
            }
        }

        if (rawmail.war_id != undefined) {
            addTypeId(app, involved, 'war_id', rawmail.war_id);
            app.util.entity.add(app, 'war_id', rawmail.war_id);
        }

        const npc = isNPC(rawmail);
        const labels = [];
        if (npc === true) labels.push('npc');
        else if (await isSolo(app, rawmail) === true) labels.push('solo');
        if (rawmail.attackers.length >= 100) labels.push('100+');
        if (rawmail.attackers.length >= 1000) labels.push('1000+');

        if (system.security_status >= 0.45) labels.push('highsec');
        if (system.security_status < 0.45 && system.security_status >= 0.05) labels.push('lowsec');
        if (system.security_status < 0.05 && region.id < 11000001) labels.push('nullsec');
        if (region.id >= 11000000 && region.id < 12000000) labels.push('w-space');
        if (region.id >= 12000000 && region.id < 13000000) labels.push('abyssal');

        killmail.stats = !npc;
        killmail.labels = labels;
        killmail.involved_cnt = rawmail.attackers.length;

        sequence++;
        killmail.sequence = sequence;

        let padhash = await get_pad_hash(app, rawmail, killmail);
        let padpromise = undefined;
        if (npc === false && padhash != undefined) {
            killmail.padhash = padhash;
            padpromise = app.db.killmails.countDocuments({
                padhash: padhash
            });
        }

        killmail.total_value = Math.round(await ship_price + await item_prices);
        await app.waitfor(promises);
        killmail.involved = involved;

        if (padpromise != undefined && (await padpromise) > 5) killmail.stats = false;

        await removeOne;
        await app.db.killmails.insertOne(killmail);
        await app.db.killhashes.updateOne(killhash, parsed);
        app.zincr('mails_parsed');
    } catch (e) {
        console.log(e);
    }
}

async function addInvolved(app, object, involved, is_victim) {
    for (let type in involved) {
        if (type.substr(-3, 3) != '_id') continue;

        const id = involved[type];
        if (type == 'weapon_type_id') {
            await app.util.entity.add(app, 'item_id', id);
            continue;
        }
        if (type == 'ship_type_id') type = 'item_id';

        await app.util.entity.add(app, type, id);
        addTypeId(app, object, type, (is_victim ? -1 * id : id));

        if (type == 'item_id') {
            var item = await app.util.entity.info(app, type, id, true);
            addTypeId(app, object, 'group_id', (is_victim ? -1 * item.group_id : item.group_id));
        }
    }
}

function addTypeId(app, object, type, id) {
    if (id != 0) {
        if (object[type] == undefined) object[type] = [];
        if (object[type].indexOf(id) == -1) object[type].push(id);
    }
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
    const item = await app.util.entity.info(app, 'item_id', ship_type_id, true);
    if (no_solo_ships.indexOf(item.group_id) != -1) return false;

    // Only ships can be solo'ed
    const group = await app.util.entity.info(app, 'group_id', item.group_id);
    if (group.category_id != 6) return false;

    let numPlayers = 0;
    for (let attacker of rawmail.attackers) {
        if (attacker.character_id > 3999999) numPlayers++;
        if (numPlayers > 1) return false;

        ship_type_id = attacker.ship_type_id;
        if (ship_type_id == undefined) return false;

        let item = await app.util.entity.info(app, 'item_id', ship_type_id);
        if (item.group_id == undefined) return false;

        let group = await app.util.entity.info(app, 'group_id', item.group_id);
        if (group.id == 65) return false;
    }
    // Ensure that at least 1 player is on the kill so as not to count losses against NPC's
    return (numPlayers == 1);
}

var added = [];

async function get_item_prices(app, items, date, in_container = false) {
    let total = 0;
    let promises = [];

    for (let item of items) {
        promises.push(get_item_price(app, item, date, in_container));
    }
    for (let p of promises) total += await p;

    return total;
}

async function get_item_price(app, item, date, in_container) {
    if (added.indexOf(item.item_type_id) == -1) {
        await app.util.entity.add(app, 'item_id', item.item_type_id);
        added.push(item.item_type_id);
    }

    let total = 0;
    if (item.items instanceof Array) {
        total += await get_item_prices(app, item.items, date, true);
    }

    if (item.singleton != 0 || in_container == true) {
        const item_info = await app.util.entity.info(app, 'item_id', item.item_type_id);
        const group = (item_info.group_id == undefined ? undefined : await app.util.entity.info(app, 'group_id', item_info.group_id));
        if (group != undefined) {
            const category = await app.util.entity.info(app, 'category_id', group.category_id);
            if (category != undefined) {
                if (category.id == 9 && (item.singleton != 0 || in_container == true)) item.singleton = 2;
            }
        }
    }

    const item_price = item.singleton != 0 ? 0.01 : await app.util.price.get(app, item.item_type_id, date);
    const qty = (item.quantity_dropped || 0) + (item.quantity_destroyed || 0);
    total += (qty * item_price);

    return total;
}

async function check_for_padding(app, rawmail) {
    let killmail_id = rawmail.killmail_id;
    let hash = rawmail.hash;

    let count = 0;
    for (let i = rawmail.killmail_id - 100; i <= rawmail.killmail_id; i++) {
        if (await app.db.killhashes.findOne({
                killmail_id: i + '',
                hash: hash
            }) != null) count++;
    }
    return count;
}

// https://forums.eveonline.com/default.aspx?g=posts&m=4900335#post4900335
async function get_pad_hash(app, rawmail, killmail) {
    let victim = rawmail.victim;
    let victimID = (victim.character_id || 0) == 0 ? 'None' : victim.character_id;
    if (victimID == 0) return undefined;
    let shipTypeID = victim.ship_type_id || 0;
    if (shipTypeID == 0) return undefined;

    let item = await app.util.entity.info(app, 'item_id', shipTypeID);
    let group = await app.util.entity.info(app, 'group_id', item.group_id);
    if (group.category_id != 6) return undefined;

    let attackers = rawmail.attackers;
    let attacker = null;
    for (let i = 0; i < attackers.length; i++) {
        if (attackers[i].finalBlow != true) continue;
        attacker = attackers[i];
        break;
    }

    if (attacker == null) attacker = attackers[0];
    let attackerID = attacker.character_id || 0;
    if (attackerID == 0) return undefined;
    let dttm = killmail.epoch;
    dttm = dttm - (dttm % 86400);
    return [victimID, attackerID, shipTypeID, dttm].join(':');
}