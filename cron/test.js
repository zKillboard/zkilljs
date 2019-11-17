module.exports = f;

const sw = require('../util/StreamWatcher.js');

async function f(app) {
    let match = {
        status: 'pending'
    };
    sw.start(app, app.db.killhashes, match, foo, 10);
    await app.sleep(120000);
}

async function foo(app, doc) {
    console.log(doc);
}
