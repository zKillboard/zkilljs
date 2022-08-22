'use strict';

module.exports = {
	exec: f,
	span: 5
}

async function f(app) {
	while (app.zinitialized != true) await app.sleep(100);

	let iterator = await app.db.information.find({update_name: true}).limit(10000);
	while (await iterator.hasNext()) {
		if (app.bailout) break;
		let row = await iterator.next();
		try {
		    if (row.type == 'war_id') continue;
		    if (row.name == null) continue;

		    if (row.name.slice(0, row.type.length) == row.type) {
		    	await app.mysql.query('delete from autocomplete where type = ? and id = ?', [row.type, row.id]);
		    	continue;
		    };

		    let searchname = row.name;
	    	if (row.type =='character_id' && row.corporation_id == 1000001) searchname = searchname + ' (recycled)';
	    	else if ((row.type == 'corporation_id' || row.type == 'alliance_id') && row.membercount === 0) searchname = searchname + ' (closed)';

	    	let mysql_result = await app.mysql.query('select name from autocomplete where type = ? and id = ? limit 1', [row.type, row.id]);
	    	if (mysql_result.length == 0 || mysql_result[0].name != searchname) {
		    	await app.mysql.query('replace into autocomplete values (?, ?, ?, ?)', [row.type, row.id, searchname, row.ticker]);
	    	}
	    } finally {
    		await app.db.information.updateOne({_id: row._id}, {$unset: {update_name: 1}});
    	    }
	}
}
