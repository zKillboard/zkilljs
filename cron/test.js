module.exports = f;

const set = new Set();
var firstRun = true;

async function f(app) {
    console.log(await app.db.killmails.estimatedDocumentCount());
}
