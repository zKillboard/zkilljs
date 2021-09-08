module.exports = f;


var firstRun = true;

const sw = require('../util/StreamWatcher.js');

async function f(app) {
    if (firstRun) {
        // clear failure reasons on mails that are successful
        // app.db.killhashes.updateMany({status: 'done', failure_reason : {$exists: true}}, {$unset: {failure_reason : 1}}, {multi: true});
        
        resetBadMails(app);

        sw.start(app, app.db.killhashes, {status: 'pending'}, fetch, 1000);
        firstRun = false;
    }
}

const http_codes_reattempt = [401, 420, 502, 503, 504];
async function resetBadMails(app) {
    for (i = 0; i < http_codes_reattempt.length; i++) {
        let code = http_codes_reattempt[i];
        await app.db.killhashes.updateMany({status: 'failed', failure_reason: 'http ' + code}, {$set: {status: 'pending'}}, {multi: true});
    }

    setTimeout(function() { resetBadMails(app); }, 60000);
}

async function fetch(app, mail) {
    if (app.no_api) return await app.sleep(1000);
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
        await app.util.assist.esi_result_handler(app, res);

        if (res.statusCode == 200) {
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
                    success: false,
                    failure_reason: 'http ' + res.statusCode
                }
            });
        }
    } catch (e) {
        console.trace(e.stack);
    }
}