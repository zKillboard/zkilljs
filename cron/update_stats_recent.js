'use strict';

async function f(app) {
    const epoch_start = Math.floor(Date.now() / 1000) - (86400 * 90);

    await app.util.stats_epoch.calc_epoch_range(app, 'killmails_90', 'activity_90', 'recent', epoch_start);
}

module.exports = f;