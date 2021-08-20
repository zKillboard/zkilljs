module.exports = f;

var fs = require('fs');
var util = require('util');

async function f(app) {
    await ztop(app);
}

async function ztop(app) {
    let out = [];

    out.push(memUsage(app));
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
        out.push(('        ' + values[key]).slice(-5) + '   ' + key.replace('zkb:ztop:', ''));
    }
    var output = out.join('\n');
    await app.redis.setex("server-information", 60, output);
    await fs.writeFileSync('/tmp/ztop.txt', output, 'utf-8');
}

function text(key, isDelayed) {
    return /*key +*/ (isDelayed ? ' n': ' Y');
}

function memUsage(app) {
    return Math.floor(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB';
};