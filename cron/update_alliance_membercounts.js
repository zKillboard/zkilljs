'use strict';

async function f(app) {
    const alliances = await app.db.information.find({type: 'alliance_id'}).toArray();

    for (const alliance of alliances) {
        if (app.bailout) return;

    	const member_corps = await app.db.information.find({type: 'corporation_id', 'alliance_id': alliance.id}).toArray();

    	let member_count = 0;
    	for (const corp of member_corps) {
            if (app.bailout) return;
            
    		member_count += (corp.member_count || 0);
    	}

    	if (alliance.member_count !== member_count) {
            alliance.member_count = member_count;
            
            await app.redis.hset('zkilljs:info:' + alliance.type, alliance.id, JSON.stringify(alliance));
    		await app.db.information.updateOne({_id: alliance._id}, {$set: {member_count: member_count}});
    	}
    }

}

module.exports = f;