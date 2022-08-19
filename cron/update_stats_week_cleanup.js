'use strict';

module.exports = {
    exec: f,
    span: 900
}

async function f(app) {
    while (app.zinitialized != true) await app.sleep(100);
    
    await app.util.killmails.remove_old_killmails(app, 'week', 7);
}