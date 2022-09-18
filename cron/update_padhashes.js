'use strict';

module.exports = {
    exec: f,
    span: 1
}

const padhash_ship_2_group = {};
const item_cache = {};
const group_cache = {};

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    let result = await app.db.killmails.find({padhash: {$exists: false}}).project({killmail_id: 1, epoch: 1}).sort({killmail_id: -1}).limit(5000);

    while (await result.hasNext()) {
        if (app.bailout) return;

        let row = await result.next();
        let rawmail = await app.db.rawmails.findOne({killmail_id: row.killmail_id});
        let padhash = await get_pad_hash(app, rawmail, row);

        await app.db.killmails_7.updateOne({killmail_id: row.killmail_id}, {$set: {padhash: padhash}});
        await app.db.killmails_90.updateOne({killmail_id: row.killmail_id}, {$set: {padhash: padhash}});
        await app.db.killmails.updateOne({killmail_id: row.killmail_id}, {$set: {padhash: padhash}});

        app.util.ztop.zincr(app, 'killmail_padhashed');
    }
}

// https://forums.eveonline.com/default.aspx?g=posts&m=4900335#post4900335
async function get_pad_hash(app, rawmail, killmail) {
    let victim = rawmail.victim;
    let victimID = (victim.character_id || 0) == 0 ? 'None' : victim.character_id;
    if (victimID == 0) return null;
    let shipTypeID = victim.ship_type_id || 0;
    if (shipTypeID == 0) return null;

    if (padhash_ship_2_group[shipTypeID] == undefined) {
        let item = item_cache[shipTypeID];
        if (item == undefined) {
            item = await app.util.entity.info(app, 'item_id', shipTypeID);
            item_cache[shipTypeID] = item;
        } 
        let group = group_cache[item.group_id];
        if (group == undefined) {
            group = await app.util.entity.info(app, 'group_id', item.group_id);
            group_cache[item.group_id] = group;
        }
        padhash_ship_2_group[shipTypeID] = group.category_id;
    }
    if (padhash_ship_2_group[shipTypeID] != 6) return null;

    let attackers = rawmail.attackers;
    let attacker = null;
    for (let i = 0; i < attackers.length; i++) {
        if (attackers[i].finalBlow != true) continue;
        attacker = attackers[i];
        break;
    }

    if (attacker == null) attacker = attackers[0];
    let attackerID = attacker.character_id || 0;
    if (attackerID == 0) return null;
    let dttm = killmail.epoch;
    dttm = dttm - (dttm % 86400);
    return [victimID, attackerID, shipTypeID, dttm].join(':');
}