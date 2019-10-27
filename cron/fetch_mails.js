module.exports = f;

async function f(app) {
    var mails, mail, url;
    let promises = [];
    var mails = await app.db.killhashes.find({
        status: 'pending'
    }).limit(1000).toArray();

    for (let i = 0; i < mails.length; i++) {
        if (app.bailout == true) break;

        mail = mails[i];

        if (await app.db.rawmails.findOne({
                killmail_id: mail.killmail_id
            }) != null) {
            await app.db.killhashes.updateOne(mail, {
                $set: {
                    status: 'fetched',
                    success: true
                }
            });
            continue;
        }

        url = app.esi + '/v1/killmails/' + mail.killmail_id + '/' + mail.hash + '/';
        promises.push(app.fetch(url, parse, failed, mail));

        await app.sleep(10);
    }

    await app.waitfor(promises);
}

async function parse(app, res, options) {
    try {
        if (res.statusCode == 200) {
            var body = JSON.parse(res.body);
            await app.db.rawmails.deleteOne({
                killmail_id: body.killmail_id
            });
            body.hash = options.hash;
            await app.db.rawmails.replaceOne({
                killmail_id: body.killmail_id
            }, body, {
                upsert: true
            });
            await app.db.killhashes.updateOne(options, {
                $set: {
                    status: 'fetched',
                    killmail_id: parseInt(options.killmail_id),
                    success: true
                }
            });
            return true;
        }
    } catch (e) {
        console.trace(e.stack);
    }
    return false;
}

async function failed(app, e, options) {
    await app.db.killhashes.updateOne(options, {
        $set: {
            status: 'failed'
        }
    });
    console.log(e);
}