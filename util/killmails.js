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
        if (await app.db.killhashes.countDocuments(key) > 0) return 0;
        key['status'] = 'pending';
        try {
            await app.db.killhashes.insertOne(key);
	    return 1;
        } catch (e) {
            if (e.code != 11000) { // Ignore duplicate entry error
                console.log(e);
            }
	    return 0;
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
            useFindAndModify: false,
        });
        return next.value.value;
    },

    remove_killmail: async function (app, collection, killmail, epoch) {
        var resets = [];

        // Mark everyone involved as needing a stat update
        for (const type of Object.keys(killmail.involved)) {
            for (var id of killmail.involved[type]) {
                if (typeof id == 'number') id = Math.abs(id);

                var reset_key = type + ':' + id;
                if (resets.indexOf(reset_key) != -1) continue;
                resets.push(reset_key);                

                await app.db.statistics.updateOne({type: type, id: id}, {$set: {['update_' + epoch]: true, [epoch + '.reset']: true}});
            }
        }

        killmail.labels.push('all');
        for (const label of killmail.labels) {
            var reset_key = 'label:' + label;
            if (resets.indexOf(reset_key) != -1) continue;
            resets.push(reset_key);

            await app.db.statistics.updateOne({type: 'label', id: label}, {$set: {['update_' + epoch]: true, [epoch + '.reset']: true}});
        }

        await app.db[collection].removeOne({killmail_id: killmail.killmail_id});
    },

    remove_old_killmails: async function(app, epoch, num_days) {
        var now = app.now();
        var remove = now - (num_days * 86400);
        var collection = 'killmails' + (epoch == 'alltime' ? '' : (epoch == 'week' ? '_7' : (epoch == 'recent' ? '_90' : '_unknown_collection')));
        var purging = await app.db[collection].find({epoch : {$lt : remove}});

        while (await purging.hasNext()) {
            var killmail = await purging.next();
            await app.util.killmails.remove_killmail(app, collection, killmail, epoch);
        }
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
