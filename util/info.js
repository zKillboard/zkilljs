'use strict';

const entity = require('../util/entity.js');
const fill = require('./info_fill.js');
const locations_fetched = {};

const info = {
    async fill(app, o) {
        return await fill.fill(app, o);
    },

    async get_info(app, type, id) {
        if (type != 'label') id = parseInt(id);
        let record = await app.db.information.findOne({
            type: type,
            id: id
        });
        return record;
    },

    async get_info_field(app, type, id, field) {
        let record = await app.util.info.get_info(app, type, id);
        return (record === undefined ? undefined : record[field]);
    },

    async get_locations(app, solar_system_id) {
        if (locations_fetched[solar_system_id] == undefined) {
            await entity.add(app, 'solar_system_id', solar_system_id, true);

            var record;
            do {
                record = await app.db.information.findOne({
                    type: 'solar_system_id',
                    id: solar_system_id
                });
                if (record.locations_fetched != true) await app.sleep(1000);
            } while (record.locations_fetched != true);

            locations_fetched[solar_system_id] = await app.db.information.find({
                type: 'location_id',
                solar_system_id: solar_system_id
            }).toArray();
        }
        return locations_fetched[solar_system_id];
    },

    async get_location_id(app, solar_system_id, location) {
        if (solar_system_id == 0) return undefined;
        if (solar_system_id > 32000000 && solar_system_id < 32999999) return undefined;

        const locations = await info.get_locations(app, solar_system_id);
        if (locations == undefined || locations.length == 0) {
            return undefined;
        }

        let minDistance = Number.MAX_VALUE;
        let returnID = undefined;

        for (let row of locations) {
            let distance = Math.sqrt(Math.pow(row.x - location.x, 2) + Math.pow(row.y - location.y, 2) + Math.pow(row.z - location.z, 2));
            if (distance < minDistance) {
                minDistance = distance;
                returnID = row.id;
            }
        }
        return Number(returnID);
    },

    async getFlagName(app, flag) {
        // Assuming Inferno Flags
        let flagGroup = 0;
        let keys = Object.keys(infernoFlags);
        for (let i = 0; i < keys.length; i++) {
            let key = keys[i];

            let array = infernoFlags[key];
            let low = array[0];
            let high = array[1];
            if (flag >= low && flag <= high) {
                flagGroup = key;
            }
            if (flagGroup != 0) {
                return effectToSlot[flagGroup];
            }
        }
        if (flagGroup == 0 && effectToSlot[flag] != undefined) {
            return effectToSlot[flag];
        }
        if (flagGroup == 0 && flag == 0) {
            return 'Corporate  Hangar';
        }
        if (flagGroup == 0) {
            return undefined;
        }
        return effectToSlot[flagGroup];
    },

    async getDogma(app, item_id, dogma_id) {
        let item = await app.util.entity.info(app, 'item_id', item_id);
        let dogma = item.dogma_attributes || {};

        for (let i = 0; i < dogma.length; i++) {
            let attr = dogma[i];
            if (attr.attribute_id == dogma_id) {
                return attr.value || 0;
            }
        }
        return undefined;
    }
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

module.exports = info;