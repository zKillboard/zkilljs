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
        });

        var resets = [];

        while (await iter.hasNext()) {
            if (app.bailout) return;

            var killmail = await iter.next();

            if (killmail.stats == false || killmail.purging == true) {
                await app.db[collection].removeOne({
                    killmail_id: killmail.killmail_id
                });
                continue;
            }
            await wait_for_stats(app);

            var original_killmail_id = killmail.killmail_id;
            var purge_mail = killmail;
            delete purge_mail._id;
            purge_mail.purging = true;
            purge_mail.killmail_id = -1 * killmail.killmail_id;
            purge_mail.total_value = -1 * killmail.total_value;
            purge_mail.involved_cnt = -1 * killmail.involved_cnt;
            purge_mail.sequence = await app.util.killmails.next_sequence(app);

            try {
                await app.db[collection].insertOne(purge_mail); // Insert the killmail
            } catch (e) {
                if (e.code != 11000) console.log(e);
            }

            // Mark everyone involved as needing a stat update
            for (const type of Object.keys(killmail.involved)) {
                for (var id of killmail.involved[type]) {
                    if (typeof id == 'number') id = Math.abs(id);

                    var reset_key = type + ':' + id;
                    if (resets.indexOf(reset_key) != -1) continue;
                    resets.push(reset_key);

                    await update_stats_record(app, type, id, epoch, purge_mail.sequence);
                }
            }

            killmail.labels.push('all');
            for (const label of killmail.labels) {
                var reset_key = 'label:' + label;
                if (resets.indexOf(reset_key) != -1) continue;
                resets.push(reset_key);

                await update_stats_record(app, 'label', label, epoch, purge_mail.sequence);
            }

            await wait_for_stats(app);

            await app.db[collection].removeOne({
                killmail_id: original_killmail_id
            });
            await app.db[collection].removeOne({
                killmail_id: purge_mail.killmail_id
            });
            return;
        }
    } catch (e) {
        console.log(e);
    }
}

async function wait_for_stats(app, epoch) {
    var count;
    do {
        if (app.bailout == true) throw 'bailing!';
        await app.sleep(1);
        count = await app.db.statistics.countDocuments({
            ['update_' + epoch]: true
        });
    } while (count > 0);
}

async function update_stats_record(app, type, id, epoch, sequence) {
    var record = await app.db.statistics.findOne({
        type: type,
        id: id
    });
    if (record == null) {
        return;
    }

    var set = {
        ['update_' + epoch]: true,
        sequence: sequence
    }

    await app.db.statistics.updateOne({
        _id: record._id,
        sequence: {
            $lt: sequence
        },
    }, {
        $set: set
    });
}

module.exports = f;