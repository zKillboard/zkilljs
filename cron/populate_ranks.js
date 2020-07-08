'use strict';

/*
	Run daily, ensures all entities are populated into the Redis sorted sets
	Rotate and expire for ranking history (TODO)
*/
async function f(app) {
    var row;
    const date_now = new Date();
    const date_week_ago = new Date(date_now.getTime() - (86400000 * 7));
    const formatted_date_now = await app.util.price.format_date(date_now);
    const formatted_date_week_ago = await app.util.price.format_date(date_week_ago);

    var result = await app.db.statistics.find();
    while (await result.hasNext()) {
        row = await result.next();

        await add_killed(app, row, 'week', formatted_date_now, formatted_date_week_ago);
        await add_killed(app, row, 'recent', formatted_date_now, formatted_date_week_ago);
        await add_killed(app, row, 'alltime', formatted_date_now, formatted_date_week_ago);
    }
}

async function add_killed(app, row, epoch, date, date7) {
    const rnowkey = 'zkilljs:ranks:' + row.type + ':' + epoch;

    var epoch_block = row[epoch] == undefined ? {} : row[epoch];

    var killed = epoch_block.killed || 0;
    if (killed > 0) await app.redis.zadd(rnowkey, killed, row.id);
}

module.exports = f;