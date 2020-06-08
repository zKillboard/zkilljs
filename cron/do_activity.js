'use strict';

const prepSet = new Set();
var firstRun = true;

async function f(app) {
    if (firstRun) {
        firstRun = false;
        iterate(app);
    }
}

async function iterate(app) {
    let prepped = 0;

    const epoch7DaysAgo = Math.floor(Date.now() / 1000) - (7 * 86400);
    const epoch90DaysAgo = Math.floor(Date.now() / 1000) - (90 * 86400);

    try {
        let killhashes = await app.db.killhashes.find({
            status: 'activity'
        });

        while (await killhashes.hasNext()) {
            if (app.no_stats) break;

            let killhash = await killhashes.next();
            let killmail = await app.db.killmails.findOne({
                killmail_id: killhash.killmail_id
            });
            const epoch = killmail.epoch;
            if (epoch <= epoch90DaysAgo) continue;

            var keys = Object.keys(killmail.involved);
            var keybase, type, ids, entity_id, key;

            for (var i = 0; i < keys.length; i++) {
                type = keys[i];
                ids = killmail.involved[type];
                for (var id of ids) {
                    id = Math.abs(id);
                    if (epoch > epoch7DaysAgo) await update(app, 'activity_7', type, id, killmail.killmail_id, epoch);
                    if (epoch > epoch90DaysAgo) await update(app, 'activity_90', type, id, killmail.killmail_id, epoch);
                }
            }

            await app.db.killhashes.updateOne({
                _id: killhash._id
            }, {
                $set: {
                    status: 'done'
                }
            });
        }

    } catch (e) {
        console.log(e);
    } finally {
        await app.sleep(1000);
        iterate(app);
    }
}

async function update(app, collection, type, id, killmail_id, epoch) {
    if (id == 0) return;
    let row = await app.db[collection].findOne({
        type: type,
        id: id
    });
    if (row == null || row.epoch < epoch) {
        await app.db[collection].updateOne({
            type: type,
            id: id
        }, {
            $set: {
                type: type,
                id: id,
                killmail_id: killmail_id,
                epoch: epoch
            }
        }, {
            upsert: true
        });
    }
}

module.exports = f;