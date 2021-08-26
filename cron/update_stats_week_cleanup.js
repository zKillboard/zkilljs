'use strict';

async function f(app) {
    await app.util.killmails.remove_old_killmails(app, 'week', 7);
}

module.exports = f;