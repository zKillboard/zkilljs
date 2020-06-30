'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;

    var rawmail = await app.db.rawmails.findOne({
        killmail_id: Number.parseInt(req.params.id)
    });
    var killmail = await app.db.killmails.findOne({
        killmail_id: Number.parseInt(req.params.id)
    });
    var km_date = new Date(killmail.epoch * 1000);

    // Ensure the attackers array exists
    if (rawmail.attackers == undefined) rawmail.attackers = [];
    // Only initially show the first 10 attackers
    if (rawmail.attackers.length > 10) rawmail.attackers.length = 10;

    // Augment the rawmail
    rawmail.victim.group_id = get_negative(killmail.involved.group_id);
    rawmail.constellation_id = killmail.involved.constellation_id[0];
    rawmail.region_id = killmail.involved.region_id[0];
    if (killmail.involved.location_id != undefined) {
    	rawmail.location_id = killmail.involved.location_id[0];
    }

    killmail.totals = {dropped: 0, destroyed: 0, total: 0};

    // Iterate through items and sort based on location
    var slots = {};
    if (rawmail.victim.items == undefined) rawmail.victim.items = [];
    for (var item of rawmail.victim.items) {
        item.quantity_destroyed = item.quantity_destroyed || 0;
        item.quantity_dropped = item.quantity_dropped || 0;

        var flag = item.flag;
        item.price = await app.util.price.get(app, item.item_type_id, km_date);
        item.slot = get_inferno_slot(flag);

        item.destroyed = (item.quantity_destroyed > 0);
        item.class = item.destroyed ? 'victimrow' : 'aggressorrow';
        item.total = item.quantity_destroyed + item.quantity_dropped;
        item.total_price = item.total * item.price;

        if (slots[item.slot] == undefined) slots[item.slot] = [];
        slots[item.slot].push(item);

        if (item.destroyed) killmail.totals.destroyed += item.total_price;
        else killmail.totals.dropped += item.total_price;
        killmail.totals.total += item.total_price;
    }
    killmail.allslots = slots;
    // Rearrange slots into proper order
    var rearranged = new Map();
    for (let [key, value] of effectToSlot) {
        var items = slots[key];
        if (items != undefined) rearranged.set(value, items);
    }
    killmail.slotkeys = Array.from(rearranged.keys());
    killmail.slots = rearranged;

    killmail.ship_price = await app.util.price.get(app, rawmail.victim.ship_type_id, km_date);
    killmail.totals.total +=  killmail.ship_price;
    killmail.totals.destroyed += killmail.ship_price;

    var ret = {
        json: {
            rawmail: rawmail,
            killmail: killmail
        },
        maxAge: 1
    };

    ret.json = await app.util.info.fill(app, ret.json);

    return ret;
}

function get_negative(arr) {
    for (var i of arr)
        if (i < 0) return arr;
    return null;
}

function get_inferno_slot(flag_id) {
    const flag_str = '' + flag_id;
    if (effectToSlot.get(flag_str) != undefined) return effectToSlot.get(flag_str);
    for (let [key, values] of infernoFlags) {
        var low = values[0];
        var high = values[1];
        if (flag_id >= low && flag_id <= high) return key;
    }
    return '-1'; // Unknown
}

const infernoFlags = new Map();
infernoFlags.set('4', [116, 121]); // ???
infernoFlags.set('12', [27, 34]); // Highs
infernoFlags.set('13', [19, 26]); // Mids
infernoFlags.set('11', [11, 18]); // Lows
infernoFlags.set('159', [159, 163]); // Fighter Tubes
infernoFlags.set('164', [164, 171]); // Structure services
infernoFlags.set('2663', [92, 98]); // Rigs
infernoFlags.set('3772', [125, 132]); // Subs

const effectToSlot = new Map();
effectToSlot.set('12', 'High Slots');
effectToSlot.set('13', 'Mid Slots');
effectToSlot.set('11', 'Low Slots');
effectToSlot.set('2663', 'Rigs');
effectToSlot.set('3772', 'SubSystems');
effectToSlot.set('87', 'Drone Bay');
effectToSlot.set('5', 'Cargo');
effectToSlot.set('4', 'Corporate Hangar');
effectToSlot.set('0', 'Corporate  Hangar'); // Yes); two spaces); flag 0 is wierd and should be 4
effectToSlot.set('89', 'Implants');
effectToSlot.set('133', 'Fuel Bay');
effectToSlot.set('134', 'Ore Hold');
effectToSlot.set('136', 'Mineral Hold');
effectToSlot.set('137', 'Salvage Hold');
effectToSlot.set('138', 'Specialized Ship Hold');
effectToSlot.set('143', 'Specialized Ammo Hold');
effectToSlot.set('90', 'Ship Hangar');
effectToSlot.set('148', 'Command Center Hold');
effectToSlot.set('149', 'Planetary Commodities Hold');
effectToSlot.set('151', 'Material Bay');
effectToSlot.set('154', 'Quafe Bay');
effectToSlot.set('155', 'Fleet Hangar');
effectToSlot.set('156', 'Hidden Modifiers');
effectToSlot.set('158', 'Fighter Bay');
effectToSlot.set('159', 'Fighter Tubes');
effectToSlot.set('164', 'Structure Service Slots');
effectToSlot.set('172', 'Structure Fuel');
effectToSlot.set('173', 'Deliveries');
effectToSlot.set('174', 'Crate Loot');
effectToSlot.set('176', 'Booster Bay');
effectToSlot.set('177', 'Subsystem Hold');
effectToSlot.set('64', 'Unlocked item, can be moved');
effectToSlot.set('-1', 'Unknown');
