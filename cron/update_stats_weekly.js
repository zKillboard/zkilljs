'use strict';

async function f(app) {
    const epoch_week = Math.floor(Date.now() / 1000) - (86400 * 7);
    var row, record, match;

    await app.util.stats_epoch.calc_epoch_range(app, 'killmails_7', 'activity_7', 'week', epoch_week);
}

module.exports = f;