'use strict';

var cache = {};

function clearCache() {
	cache.length = 0;
    console.log('clearing local info cache');
	setTimeout(clearCache, 900000);
}
clearCache();

const info_fill = {
    async fill(app, object) {
        if (object == undefined) return object;
        
        // Check for solar system and pre-fill const and region ID's
        if (object.solar_system_id !== undefined) {
            var constellation = await this.getInfo(app, 'constellation_id', object.constellation_id);
            if (constellation != undefined) {
                object.constellation_id = constellation.id;
                object.region_id = constellation.region_id;
            }
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
                        var record = await this.getInfo(app, key, o);
    					if (record != null && record.name != undefined) {
                            object[key.replace('_id', '_name')] = record.name;
                        }
    					break;
    				case 'ship_type_id':
    				case 'weapon_type_id':
    				case 'item_type_id':
    					var record = await this.getInfo(app, 'item_id', o);
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

    async getInfo(app, type, id) {
    	const key = type + ':' + id;
    	let record;
    	if (cache[key] != undefined) {
    		record = cache[key];
    	} else {
            id = parseInt(id || 0);
            if (id == 0) return {};

            // Try the Redis cache first
            var json = await app.redis.hget('zkilljs:info:' + type, id);
            if (json != null) {
                record = JSON.parse(json);
                if (record != null) cache[key] = record;
                return record;
            }

            await app.util.entity.wait(app, type, id);
    		record = await app.db.information.findOne({type: type, id: id});
    		if (record != null) cache[key] = record;
    	}

    	return record;
    }
}

module.exports = info_fill;