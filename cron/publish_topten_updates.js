'use strict';

module.exports = {
    exec: f,
    span: 300
}

let concurrent = 0;

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);

    let www_server_started = await  app.redis.get('zkilljs:www:server_started');
    if (www_server_started != null) {
        let rediskey = 'zkilljs:toplists:publish';
        let copy = rediskey + '_copy';
        if (await app.redis.exists(rediskey) > 0) {
            await app.redis.rename(rediskey, copy);
            while (await app.redis.scard(copy) > 0) {
                if (app.bailout == true) return;

                while (concurrent >= 25) await app.sleep(10);
                let next = await app.redis.spop(copy);
                if (next == null) break;

                concurrent++;
                prepTopTen(app, JSON.parse(next));
            }
        }    
    }
    await prepTopTen(app, {type: 'label', id: 'all'});
}

async function prepTopTen(app, json) {
    try {
        let type = json.type.replace('_id', '');
        let id = (type == 'label' ? '0' : json.id)
        let base = '/' + json.type.replace('_id', '') + '/' + json.id;
        let pubkey = 'toplistsfeed:' + base;

        let modifier = (type == 'label' ? id + ',' : '');

        let url = 'http://localhost:' + process.env.PORT + '/site/toptens.html?id=:id&modifiers=:modweek&type=:type'
            .replace(':type', type)
            .replace(':id', id)
            .replace(':mod', modifier);

        await app.phin({url: url, followRedirects: true})
        await app.redis.publish(pubkey, JSON.stringify({action: 'toplistsfeed', path: base}));
    } finally {
        concurrent--;
    }
}