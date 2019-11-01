module.exports = f;

const queryLimit = 5000;

const set = new Set();
var firstRun = true;

async function f(app) {
    if (firstRun) {
        firstRun = false;
        populateSet(app);
    }

    await app.sleep(1000);
    while (app.bailout && set.size > 0) await app.sleep(1000);
}

async function populateSet(app) {
    try {
        var mails = await app.db.killhashes.find({
            status: 'pending'
        });

        let fetched = 0;
        while (await mails.hasNext()) {
            if (app.bailout) {
                return;
            }

            fetch(app, await mails.next());
            await app.redis.setex("zkb:populateSet", 60, set.size);
            while (set.size >= 100) await app.sleep(1);

            // Do we seem to have a lot of mails to fetch?
            fetched++;
            if (fetched % 1000 == 0) {
                await app.redis.setex("zkb:no_parsing", 300, "true");
                await app.redis.setex("zkb:no_stats", 300, "true");
            }
            await app.sleep(1);
        }
        if (fetched < 1000) await app.redis.del("zkb:no_parsing");
        while (set.size > 0) await app.sleep(1);
    } catch (e) {
        console.log(e);
    } finally {
        await app.sleep(1000);
        populateSet(app);
    }
}


async function fetch(app, mail) {
    try {
        set.add(mail);

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
        }
    } catch (e) {
        console.trace(e.stack);
    } finally {
        set.delete(mail);
    }
    return false;
}