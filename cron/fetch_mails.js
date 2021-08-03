module.exports = f;


var firstRun = true;

const sw = require('../util/StreamWatcher.js');
const match = {
    status: 'pending'
};

async function f(app) {
    if (firstRun) {
        sw.start(app, app.db.killhashes, match, fetch, 1000, {killmail_id: -1});
        firstRun = false;
    }
}

async function fetch(app, mail) {
    try {
        if (await app.db.rawmails.countDocuments({
                killmail_id: mail.killmail_id
            }) > 0) {
            await app.db.killhashes.updateOne(mail, {
                $set: {
                    status: 'fetched',
                    success: true
                }
            });
            return;
        }

        let url = app.esi + '/v1/killmails/' + mail.killmail_id + '/' + mail.hash + '/';
        let res = await app.phin(url);

        if (res.statusCode == 200) {
            app.zincr('esi_fetched');
            app.zincr('mails_fetched');

            var body = JSON.parse(res.body);

            await app.db.rawmails.deleteOne({
                killmail_id: body.killmail_id
            });
            body.hash = mail.hash;
            await app.db.rawmails.replaceOne({
                killmail_id: body.killmail_id
            }, body, {
                upsert: true
            });
            await app.db.killhashes.updateOne(mail, {
                $set: {
                    status: 'fetched',
                    killmail_id: parseInt(mail.killmail_id),
                    success: true
                }
            });
            return true;
        } else {
            await app.db.killhashes.updateOne(mail, {
                $set: {
                    status: 'failed',
                    killmail_id: parseInt(mail.killmail_id),
                    success: false
                }
            });
        }
    } catch (e) {
        console.trace(e.stack);
    }
}