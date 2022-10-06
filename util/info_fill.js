'use strict';

//var cache = {};

const info_fill = {
    async fill(app, object) {
        if (object == undefined) return object;
        
        // Check for solar system and pre-fill const and region ID's
        if (object.system_id !== undefined) {
            console.log(object);
            let region_id = await app.util.info.get_info_field(app, 'constellation_id', object.constellation_id, 'region_id');
            if (region_id) object.region_id = region_id;
        }

        let keys = Object.keys(object);
        let count = keys.length;

    	for (let i = 0; i < count; i++) {
    		let key = keys[i];
    		const o = object[key];

            var record = undefined;

    		if (typeof o == 'object') object[key] = await this.fill(app, o);
    		else {
    			// Step 1, we'll populate names here
    			switch (key) {
                    case 'system_id':
                        key = 'solar_system_id';
                        // Purposeful fall through
                    case 'solar_system_id':
                        record = await app.util.info.get_info(app, key, o, true);
                        if (record != null && record.name != undefined) {
                            object[key.replace('_id', '_security_status')] = record.security_status;
                            var rounded = Math.max(0, Math.round(record.security_status * 10, 1));
                            if (rounded == 0 && record.security_status > 0 && record.security_status < 0.1) {
                                rounded = 1;
                            }
                            object[key.replace('_id', '_security_rounded')] = rounded;
                        }
                        // Purposeful fall thruogh
    				case 'character_id':
    				case 'corporation_id':
    				case 'alliance_id':
    				case 'faction_id':
    				case 'constellation_id':
    				case 'region_id':
                    case 'location_id':
    				case 'item_id':
                    case 'group_id':
                    case 'category_id':
                        if (record == undefined || record == null) record = await app.util.info.get_info(app, key, o, true);
    					if (record != null && record.name != undefined) {
                            object[key.replace('_id', '_name')] = record.name;
                        }
    					break;
    				case 'ship_type_id':
    				case 'weapon_type_id':
    				case 'item_type_id':
    					record = await app.util.info.get_info(app, 'item_id', o);
    					if (record != null) object[key.replace('_id', '_name')] = (record.name + (object.singleton > 0 ? ' (copy)' : ''));
    					break;

    				default:
    					//console.log('Unknown key! ' + key);
    			}

    			// Step 2, populate system sec levels, status codes, etc.
    			switch (key) {
    				
    			}
    		}
    	}

    	return object;
    },
}

module.exports = info_fill;