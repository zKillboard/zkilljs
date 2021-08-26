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
    rawmail.victim.category_id = await app.util.info.get_info_field(app, 'group_id', Math.abs(rawmail.victim.group_id), 'category_id');
    rawmail.constellation_id = killmail.involved.constellation_id[0];
    rawmail.region_id = killmail.involved.region_id[0];
    if (killmail.involved.location_id != undefined) {
    	rawmail.location_id = killmail.involved.location_id[0];
    }

    killmail.totals = {dropped: 0, destroyed: 0, total: 0};

    // Iterate through items and sort based on location
    var slots = {};
    if (rawmail.victim.items == undefined) rawmail.victim.items = [];
    var fittingwheelitems = [];
    var last_slot = undefined;
    for (var item of get_all_items(rawmail.victim.items)) {
        var flag = item.flag;
        item.slot = get_inferno_slot(flag);
        if (infernoFlags.get(item.slot) != undefined) fittingwheelitems.push(item);

        // Get item price and determine quantities
        item.price = await app.util.price.get(app, item.item_type_id, km_date, true);
        item.quantity_destroyed = item.quantity_destroyed || 0;
        item.quantity_dropped = item.quantity_dropped || 0;
        item.destroyed = (item.quantity_destroyed > 0);
        item.class = item.destroyed ? 'victimrow' : 'aggressorrow';
        item.total = item.quantity_destroyed + item.quantity_dropped;
        item.total_price = item.total * item.price;
        if (item.destroyed) killmail.totals.destroyed += item.total_price;
        else killmail.totals.dropped += item.total_price;
        killmail.totals.total += item.total_price;

        if (item.in_container) item.slot = last_slot;

        if (effectToSlot.get(item.slot) == undefined) effectToSlot.set(item.slot, item.slot);

        if (slots[item.slot] == undefined) slots[item.slot] = [];
        slots[item.slot].push(item);
        last_slot = item.slot;
    }
    killmail.cargo_groups = [];
    killmail.group_names = {};

    // Rearrange slots into proper order
    var rearranged = new Map();
    for (let [key, value] of effectToSlot) {
        var items = slots[key];
        if (items != undefined) {
            rearranged.set(value, items);
            killmail.cargo_groups.push(key);
            killmail.group_names[key] = effectToSlot.get(key);
        }
    }
    killmail.slotkeys = Array.from(rearranged.keys());

    // Iterate and reduce the slots/items into like categories
    let items_compressed = {};
    for (let [key, value] of rearranged) {
        let new_value = {};
        for (let i = 0; i < value.length; i++) {
            let v = value[i];
            let value_key = v.item_type_id + (v.quantity_destroyed > 0 ? ':1' : ':0');
            // Unless it's an item or in a container, then it is
            // all or nothing anyway
            if (v.items != undefined || v.in_container == true) {
                delete v.items;
                value_key = 'item:' + i;
            }

            let vv = new_value[value_key];
            if (vv == undefined) {
                vv = JSON.parse(JSON.stringify(v));
            } else {
                vv.quantity_destroyed += v.quantity_destroyed;
                vv.quantity_dropped += v.quantity_dropped;
                vv.total += v.total;
                vv.total_price += v.total_price;
            }
            new_value[value_key] = vv;
        }
        items_compressed[key] = Object.values(new_value);
    }

    killmail.slots = rearranged;
    killmail.group_items = items_compressed;

    // Iterate the items for fitting wheel population
    var fittingwheel = [];
    for (let item of fittingwheelitems) {
        let group = infernoFlags.get(item.slot);
        if (group == undefined) continue;
        var low = group[0];
        var slot = item.flag - low + 1;
        item.flagclass = 'flag' + item.flag;
        var group_id = await app.util.info.get_info_field(app, 'item_id', item.item_type_id, 'group_id');
        var item_category = await app.util.info.get_info_field(app, 'group_id', group_id, 'category_id');
        item.base = (item_category == 66 || item_category == 7 || item.slot == '3772') ? 'fitted' : 'charge';
        fittingwheel.push(item);
    }
    killmail.fittingwheel = fittingwheel;

    killmail.ship_price = await app.util.price.get(app, rawmail.victim.ship_type_id, km_date, true);
    killmail.totals.total +=  killmail.ship_price;
    killmail.totals.destroyed += killmail.ship_price;

    delete killmail.involved; // Not needed, present in rawmail 

    var ret = {
        json: {
            rawmail: rawmail,
            killmail: killmail
        },
        maxAge: 3600
    };

    ret.json = await app.util.info.fill(app, ret.json);

    return ret;
}

function get_negative(arr) {
    for (var i of arr) {
        if (i < 0) {
            return i;
        }
    }
    return null;
}

function get_inferno_slot(flag_id) {
    let flag_str = '' + flag_id;
    for (let [key, values] of infernoFlags) {
        var low = values[0];
        var high = values[1];
        if (flag_id >= low && flag_id <= high) return key;
    }
    if (effectToSlot.get(flag_str) != undefined) return effectToSlot.get(flag_str);
    return '-1'; // Unknown
}

function get_all_items(arr) {
    let ret = [];
    if (arr == undefined) return ret;
    for (let i = 0; i < arr.length; i++) {
        let item = arr[i];
        ret.push(item);
        if (item.items != undefined) {
            let containered = get_all_items(item.items);
            for (let j = 0; j < containered.length; j++) {
                containered[j].in_container = true;
                ret.push(containered[j]);
            }
        }
    }
    return ret;
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
// effectToSlot.set('Cargo', 'Cargo');
// effectToSlot.set('Fleet Hangar', 'Fleet Hangar');
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
