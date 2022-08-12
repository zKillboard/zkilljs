'use strict';

module.exports = {
    exec: f,
    span: 15
}

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    await app.util.assist.publish_key(app, 'statsfeed', 'zkilljs:stats:publish');
}