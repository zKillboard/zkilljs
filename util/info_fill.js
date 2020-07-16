'use strict';

//var cache = {};

const info_fill = {
    async fill(app, object) {
        if (object == undefined) return object;
        
        // Check for solar system and pre-fill const and region ID's
        if (object.solar_system_id !== undefined) {
            /*var constellation = await app.db.util.info(app, 'constellation_id', object.constellation_id);
            if (constellation != undefined) {
                object.constellation_id = constellation.id;
                object.region_id = constellation.region_id;
            }*/
        }

        let keys = Object.keys(object);
        let count = keys.length;

    	for (let i = 0; i < count; i++) {
    		let key = keys[i];
    		const o = object[key];

    		if (typeof o == 'object') object[key] = await this.fill(app, o);
    		else {
    			// Step 1, we'll populate names here
    			switch (key) {
    				case 'character_id':
    				case 'corporation_id':
    				case 'alliance_id':
    				case 'faction_id':
    				case 'solar_system_id':
    				case 'constellation_id':
    				case 'region_id':
                    case 'location_id':
    				case 'item_id':
                    case 'group_id':
                    case 'category_id':
                        var record = await app.util.info.get_info(app, key, o, true);
    					if (record != null && record.name != undefined) {
                            object[key.replace('_id', '_name')] = record.name;
                        }
    					break;
    				case 'ship_type_id':
    				case 'weapon_type_id':
    				case 'item_type_id':
    					var record = await app.util.info.get_info(app, 'item_id', o);
    					if (record != null) object[key.replace('_id', '_name')] = record.name;
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