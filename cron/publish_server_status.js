'use strict';

module.exports = {
    exec: f,
    span: 5
}

async function f(app) {
    while (app.bailout != true && app.zinitialized != true) await app.sleep(100);
    
    var msg = JSON.stringify({
        'action': 'server_status', 
        'server_started': await app.redis.get('www:status:server_started'), 
        'mails_parsed': await app.redis.get('www:status:mails_parsed')
    });
    await app.redis.publish('zkilljs:public', msg);
}