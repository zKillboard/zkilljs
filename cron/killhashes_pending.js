'use strict';

module.exports = {
    exec: f,
    span: 1
}

let firstRun = true;

const max_concurrent = (process.env.max_concurrent_pending == undefined ? 10 : Math.max(1, parseInt(process.env.max_concurrent_pending)));

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    if (firstRun) {
        firstRun = false;
        app.db.killhashes.updateMany({status: 'done', failure_reason : {$exists: true}}, {$unset: {failure_reason : 1}}, {multi: true});
        // resetBadMails(app);
    }

    await app.util.simul.go(app, 'killhashes_pending', app.db.killhashes, {find: {status: 'pending'}, sort: {killmail_id: -1}}, fetch, app.util.assist.continue_simul_go, max_concurrent);
}

function bailout() {
    return app.bailout != false;
}

const http_codes_reattempt = [401, 420, 502, 503, 504];
async function resetBadMails(app) {
    await app.db.killhashes.updateMany({status: 'parse-error'}, {$set: {status: 'pending'}}, {multi: true});
    for (let i = 0; i < http_codes_reattempt.length; i++) {
        let code = http_codes_reattempt[i];
        await app.db.killhashes.updateMany({status: 'failed', failure_reason: 'http ' + code}, {$set: {status: 'pending'}}, {multi: true});
    }

    setTimeout(function() { resetBadMails(app); }, 60000);
}

async function fetch(app, mail) {
    try {
        if (await app.db.rawmails.countDocuments({killmail_id: mail.killmail_id}) > 0) {
            await app.db.killhashes.updateOne(mail, { $set: {status: 'fetched', success: true}});
            app.util.ztop.zincr(app, 'killmail_imported_preexisting');
            return;
        }

        while (app.bailout != true && app.dbstats.prices > 1) await app.sleep(100); // give priority to price fetches


        let url = process.env.esi_url + '/v1/killmails/' + mail.killmail_id + '/' + mail.hash + '/';
        let res = await app.phin({url: url, timeout: 5000});

        if (res.statusCode == 200) {
            let body = JSON.parse(res.body);

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
            app.util.ztop.zincr(app, 'killmail_imported_esi');
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
        console.log(e.stack);
        await app.sleep(1000);
    }
}