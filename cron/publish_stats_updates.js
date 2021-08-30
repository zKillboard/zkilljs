'use strict';

async function f(app) {
    await app.util.assist.publish_key(app, 'statsfeed', 'zkilljs:stats:publish');
}

module.exports = f;