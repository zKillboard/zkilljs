'use strict';

var last_reset_check = 0;

async function f(app) {
    if (app.bailout == true) return;

    var days7 = clear_kills(app, 'killmails_7', 'week', Math.floor(Date.now() / 1000) - (86400 * 7));
    var days90 = clear_kills(app, 'killmails_90', 'recent', Math.floor(Date.now() / 1000) - (86400 * 90));

    await days7;
    await days90;

    if ((Date.now() - last_reset_check) > 60000) {
        // Find/reset any that have 0 kills or 0 losses
        await app.db.statistics.updateMany({'recent.lost' : { $lte: 0}, 'recent.killed': {$lte: 0}}, {$set : { update_recent: true, 'recent.reset': true }}, {multi: true});
        await app.db.statistics.updateMany({'recent.killed': {$lte: 0}}, {$set : { update_recent: true, 'recent.reset': true }}, {multi: true});
        await app.db.statistics.updateMany({'week.lost' : { $lte: 0}, 'week.killed': {$lte: 0}}, {$set : { update_week: true, 'week.reset': true }}, {multi: true});
        await app.db.statistics.updateMany({'week.killed': {$lte: 0}}, {$set : { update_week: true, 'week.reset': true }}, {multi: true});
        last_reset_check = Date.now();
    }
}

async function clear_kills(app, collection, epoch, max_epoch) {
    try {
        var iter = await app.db[collection].find({
            epoch: {
                '$lt': max_epoch
            }
        }).limit(1);

        while (await iter.hasNext()) {
            if (app.bailout) return;

            var killmail = await iter.next();

            if (killmail.killmail_id < 0) await app.util.stats.wait_for_stats(app, epoch);

            if (killmail.stats == false || killmail.purging == true || killmail.killmail_id < 0) {
                await app.db[collection].removeOne({
                    killmail_id: killmail.killmail_id
                });
                continue;
            }
            
            await app.util.killmails.remove(app, collection, killmail, epoch);
        }
    } catch (e) {
        console.log(e);
    }
}




module.exports = f;