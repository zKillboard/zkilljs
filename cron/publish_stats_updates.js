'use strict';

module.exports = {
    exec: f,
    span: 15
}

async function f(app) {
    await app.util.assist.publish_key(app, 'statsfeed', 'zkilljs:stats:publish');
}