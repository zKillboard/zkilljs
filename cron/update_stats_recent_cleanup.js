'use strict';

const days90 = 86400 * 90;

async function f(app) {
    console.log('Removing 90+ day old killmails from killmails_90');
    var r = await app.db.killmails_90.deleteMany({
        epoch: {
            '$lt': (Math.floor(Date.now() / 1000) - days90)
        }
    });

    console.log('Resetting recent stats');
    await app.db.statistics.updateMany({
        'recent.last_sequence': {
            '$exists': true
        }
    }, {
        $set: {
            update_recent: true,
            'recent.reset': true
        }
    }, {
        multi: true
    });
}

module.exports = f;