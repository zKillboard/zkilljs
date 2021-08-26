'use strict';

async function f(app) {
    await app.util.killmails.remove_old_killmails(app, 'recent', 90);
}

module.exports = f;