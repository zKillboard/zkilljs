'use strict';

const days7 = 86400 * 7;

async function f(app) {
    console.log('Removing 7+ day old killmails from killmails_7');
    var r = await app.db.killmails_7.deleteMany({
        epoch: {
            '$lt': (Math.floor(Date.now() / 1000) - days7)
        }
    });

    console.log('Resetting week stats');
    await app.db.statistics.updateMany({
        'week.last_sequence': {
            '$exists': true
        }
    }, {
        $set: {
            update_week: true,
            'week.reset': true
        }
    }, {
        multi: true
    });
}

module.exports = f;