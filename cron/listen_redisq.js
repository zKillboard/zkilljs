'use strict';

module.exports = {
    exec: f,
    span: 15
}

const url = 'https://redisq.zkillboard.com/listen.php?ttw=1';

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    if (process.env.listen_redisq != 'true') return;

    try {
        do {
            if (app.bailout) return;

            let res = await app.phin({url: url, timeout: 15000});

            if (res.statusCode != 200) return;

            var body = JSON.parse(res.body);
            if (body.package !== null) {
                await app.util.killmails.add(app, body.package.killID, body.package.zkb.hash);
                app.util.ztop.zincr(app, 'killmail_add_redisq');
            }
        } while (body.package !== null);
    } catch (e) {
        console.log(e.stack);
    }
}