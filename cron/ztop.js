module.exports = f;

var fs = require('fs');
var util = require('util');

async function f(app) {
    await ztop(app);
}

async function ztop(app) {
    let out = [];

    out.push([
        text('Fetching', false), 
        text('Parsing', app.delay_parse), 
        text('Prepping', app.delay_prep), 
        text('Statting', app.delay_stat), 
        text('Dailies', app.no_fetch_dailies)
        ].join(', '));

    let values = [];
    let keys = await app.redis.keys("zkb:ztop:*");
    keys.sort();
    for (let key of keys) {
        values[key] = await app.redis.get(key);
        await app.redis.decrby(key, values[key]);
        out.push(values[key] + '\t' + key.replace('zkb:ztop:', ''));
    }
    await fs.writeFileSync('/tmp/ztop.txt', out.join('\n'), 'utf-8');
}

function text(key, isDelayed) {
    return key + (isDelayed ? ' n': ' Y');
}
