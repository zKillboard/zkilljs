'use strict';

module.exports = {
    exec: f,
    span: 3600
}

async function f(app) {
    while (app.zinitialized != true) await app.sleep(100);
    
    const alliances = await app.db.information.find({type: 'alliance_id'}).toArray();

    for (const alliance of alliances) {
        if (app.bailout) return;

    	const member_corps = await app.db.information.find({type: 'corporation_id', 'alliance_id': alliance.id}).toArray();

    	let member_count = 0;
    	for (const corp of member_corps) member_count += (corp.member_count || 0);

    	if (alliance.member_count !== member_count) {
            alliance.member_count = member_count;            
    		await app.db.information.updateOne({_id: alliance._id}, {$set: {member_count: member_count}});
    	}
    }
}