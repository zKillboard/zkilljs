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

    // Iterate through items and sort based on location
    var slots = {};
    if (rawmail.victim.items == undefined) rawmail.victim.items = [];
    for (var item of rawmail.victim.items) {
        var flag = item.flag;
        item.price = await app.util.price.get(app, item.item_type_id, km_date);
        item.slot = get_inferno_slot(flag);

        if (slots[item.slot] == undefined) slots[item.slot] = [];
        slots[item.slot].push(item);
    }
    // Rearrange slots into proper order
    killmail.slots = slots;
    killmail.ship_price = await app.util.price.get(app, rawmail.victim.ship_type_id, km_date);

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
    if (effectToSlot[flag_id] != undefined) return effectToSlot[flag_id];
    for (var i = 0; i < infernoKeys.length; i++) {
        var key = infernoKeys[i];
        var values = infernoFlags[key];

        var low = values[0];
        var high = values[1];
        if (flag_id >= low && flag_id <= high) {
            var slot = effectToSlot[key];
            return slot;
        }
    }
    return "Unknown";
}

const infernoFlags = {
    4: [116, 121], // ???
    12: [27, 34], // Highs
    13: [19, 26], // Mids
    11: [11, 18], // Lows
    159: [159, 163], // Fighter Tubes
    164: [164, 171], // Structure services
    2663: [92, 98], // Rigs
    3772: [125, 132], // Subs
};
const infernoKeys = Object.keys(infernoFlags);

const effectToSlot = {
    '12': 'High Slots',
    '13': 'Mid Slots',
    '11': 'Low Slots',
    '2663': 'Rigs',
    '3772': 'SubSystems',
    '87': 'Drone Bay',
    '5': 'Cargo',
    '4': 'Corporate Hangar',
    '0': 'Corporate  Hangar', // Yes, two spaces, flag 0 is wierd and should be 4
    '89': 'Implants',
    '133': 'Fuel Bay',
    '134': 'Ore Hold',
    '136': 'Mineral Hold',
    '137': 'Salvage Hold',
    '138': 'Specialized Ship Hold',
    '143': 'Specialized Ammo Hold',
    '90': 'Ship Hangar',
    '148': 'Command Center Hold',
    '149': 'Planetary Commodities Hold',
    '151': 'Material Bay',
    '154': 'Quafe Bay',
    '155': 'Fleet Hangar',
    '156': 'Hidden Modifiers',
    '158': 'Fighter Bay',
    '159': 'Fighter Tubes',
    '164': 'Structure Service Slots',
    '172': 'Structure Fuel',
    '173': 'Deliveries',
    '174': 'Crate Loot',
    '176': 'Booster Bay',
    '177': 'Subsystem Hold',
    '64': 'Unlocked item, can be moved',
};
const slotKeys = Object.keys(effectToSlot);