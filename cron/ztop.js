module.exports = f;

var fs = require('fs');
var util = require('util');

var epochs = {
    moment: 1,
    five: 300,
    hour: 3600,
}

var totals = {};

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
    let keys = Object.keys(app.ztops); //await app.redis.keys("zkb:ztop:*");
    keys.sort();
    var value = 0;
    for (let key of keys) {
        value = app.ztops[key];

        app.ztops[key] = 0;
        var str = '';
        for (let epoch in epochs) {
            if (totals[epoch] === undefined) totals[epoch] = {};
            totals[epoch][key] = (totals[epoch][key] || 0) + value;
            str += ('           ' + totals[epoch][key].toLocaleString()).slice(-12);

            if (value > 0) setTimeout(decrement.bind(null, epoch, key, value), epochs[epoch] * 1000);
        }
        out.push(str + '    ' + key)
    }
    var output = out.join('\n');
    await app.redis.setex("server-information", 60, output);
    await fs.writeFileSync('/tmp/ztop.txt', output, 'utf-8');
}

function decrement(epoch, key, value) {
    totals[epoch][key] = totals[epoch][key] - value;
}

function text(key, isDelayed) {
    return /*key +*/ (isDelayed ? ' n': ' Y');
}

function memUsage(app) {
    return Math.floor(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB';
};