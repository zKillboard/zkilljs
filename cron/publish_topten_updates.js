'use strict';

module.exports = {
    exec: f,
    span: 900
}

async function f(app) {
    await app.util.assist.publish_key(app, 'toplistsfeed', 'zkilljs:toplists:publish');
}