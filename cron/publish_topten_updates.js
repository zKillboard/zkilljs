'use strict';

async function f(app) {
    await app.util.assist.publish_key(app, 'toplistsfeed', 'zkilljs:toplists:publish');
}

module.exports = f;