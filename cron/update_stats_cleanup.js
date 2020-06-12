'use strict';

async function f(app) {
    try {
        app.no_stats = true;
        await app.sleep(30000); // Wait 30 seconds, give everyone a chance to finish up

        await clear_kills(app, 'killmails_7', 'week', Math.floor(Date.now() / 1000) - (86400 * 7));
        await clear_kills(app, 'killmails_90', 'recent', Math.floor(Date.now() / 1000) - (86400 * 90));
    } finally {
        app.no_stats = false;
    }
}

async function clear_kills(app, collection, epoch, max_epoch) {
    var iter = await app.db[collection].find({
        epoch: {
            '$lt': max_epoch
        }
    });

    var resets = [];

    while (await iter.hasNext()) {
        var killmail = await iter.next();

        var match = {
            killmail_id: killmail.killmail_id
        };
        var facet = await app.util.stats.facet_query(app, collection, match);
        var top10 = facet['topisk'];
        delete facet['topisk'];
        facet = inverse(facet);



        for (const type of Object.keys(killmail.involved)) {
            for (var id of killmail.involved[type]) {
                if (typeof id == 'number') id = Math.abs(id);

                var reset_key = type + ':' + id;
                if (resets.indexOf(reset_key) != -1) continue;
                resets.push(reset_key);

                //console.log(type, id);
                var record = await app.db.statistics.findOne({
                    type: type,
                    id: id
                });
                var set = {};
                set['update_' + epoch] = true;
                set[epoch] = {};
                set[epoch].reset = true;
                await app.db.statistics.updateOne({
                    _id: record._id
                }, {
                    '$set': set
                });
            }
        }

        await app.db[collection].removeOne({
            killmail_id: killmail.killmail_id
        });
    }
}

async function apply_facet(app, record, epoch, facet) {

}

function inverse(facet) {
    if (facet == null) return facet;

    if (typeof facet == 'object') {
        var keys = Object.keys(facet);
        for (const key of keys) {
            var value = facet[key];
            if (key == '_id') continue;

            if (typeof value == 'object') facet[key] = inverse(value);
            else if (typeof value == 'number') facet[key] = -1 * value;
            else {
                console.log(key, typeof value);
                continue;

                switch (key) {
                case 'count':
                case 'inv':
                case 'isk':
                    facet[key] = -1 * value;
                default:
                    console.log(typeof key);
                }
            }
        }
    } else console.log('How to handle: ' + (typeof facet));
    return facet;
}




module.exports = f;