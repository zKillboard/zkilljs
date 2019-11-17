module.exports = f;

let url = 'https://redisq.zkillboard.com/listen.php?ttw=1';

async function f(app) {

    try {
        do {
            if (app.bailout) return;
            let res = await app.phin(url);
            if (res.statusCode != 200) return;

            var body = JSON.parse(res.body);
            if (body.package !== null) {
                await app.util.killmails.add(app, body.package.killID, body.package.zkb.hash);
            }
        } while (body.package !== null);
    } catch (e) {
        console.trace(e.stack);
    }
}