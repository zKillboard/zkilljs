'use strict';

async function f(app) {
    await app.db.killmails.removeMany({});
    await app.db.statistics.removeMany({});
    await app.db.killhashes.updateMany({}, {
        $set: {
            status: 'pending'
        }
    }, {
        multi: true
    });
}

module.exports = f;