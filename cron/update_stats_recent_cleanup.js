'use strict';

module.exports = {
    exec: f,
    span: 10800
}

async function f(app) {
    await app.util.killmails.remove_old_killmails(app, 'recent', 90);
}