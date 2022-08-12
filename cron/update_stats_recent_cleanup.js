'use strict';

module.exports = {
    exec: f,
    span: 10800
}

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    await app.util.killmails.remove_old_killmails(app, 'recent', 90);
}