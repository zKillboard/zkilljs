'use strict';

module.exports = {
    async add(app, killmail_id, hash) {
        if (typeof killmail_id != 'number') killmail_id = parseInt(killmail_id);
        if (typeof hash != 'string') throw 'hash must be a string';
        if (killmail_id <= 0) throw 'Non-numeric or 0 killmail_id given';
        let key = {
            killmail_id: killmail_id,
            hash: hash
        };
        if (await app.db.killhashes.countDocuments(key) > 0) return;
        key['status'] = 'pending';
        try {
            await app.db.killhashes.insertOne(key);
        } catch (e) {
            if (e.code != 11000) { // Ignore duplicate entry error
                console.log(e);
            }
        }
    },

    next_sequence: async function (app) {
        var next = await app.db.settings.findOneAndUpdate({
            'key': 'sequence'
        }, {
            '$inc': {
                value: 1
            }
        }, {
            upsert: true,
            returnNewDocument: true,
            returnOriginal: false // seriously driver... come on just respect returnNewDocument
        });
        return next.value.value;
    },

    remove: async function (app, collection, killmail, epoch) {
        var resets = [];

        await app.util.stats.wait_for_stats(app);

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

        await app.util.stats.wait_for_stats(app);

        await app.db[collection].removeOne({
            killmail_id: original_killmail_id
        });
        await app.db[collection].removeOne({
            killmail_id: purge_mail.killmail_id
        });

        purge_mail = null; // Having these two cause a circular dependency which causes a memory leak...
        killmail = null; // Having these two cause a circular dependency which causes a memory leak...
    }
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