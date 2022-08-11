'use strict';

module.exports = {
    exec: f,
    span: 5
}

var fs = require('fs');
var util = require('util');

var epochs = {
    moment: 5,
    minute: 60,
    five: 300,
    hour: 3600,
    //day: 86400,
}

var first_run = true;

async function f(app) {
    if (first_run == true) {
        first_run = false;
    }
    await ztop(app);
}

async function cleanup(app) {
    await clear_keys(app, await app.redis.keys('ztop:*'));
}

async function clear_keys(app, keys) {
    for (let key of keys) {
        console.log('del', key);
        await app.redis.del(key); 
    }
}

async function ztop(app) {
    let out = [];

    var now = app.now();

    out.push([new Date()]);

    out.push([
        memUsage(app),
        text('Fetching', false), 
        text('Parsing', app.delay_parse), 
        text('Prepping', app.delay_prep), 
        text('Statting', app.delay_stat), 
        text('Dailies', app.no_fetch_dailies)
        ].join(', '));
    out.push([]);

    var str = '';
    for (let epoch in epochs) {
        str += (('           ' + (epochs[epoch])).toLocaleString()).slice(-12);
    }
    out.push(str + '    seconds');

    let keys = await app.redis.keys('zkb:ztop:*');

    for (let key of keys) {
        let base = key.replace('zkb:ztop:', '');
        await app.redis.setex('ztop:base:' + base, 86400, "true");
        let value = parseInt(await app.redis.get(key));

        for (let epoch in epochs) {
            var redis_key = 'ztop:' + base + ':' + epochs[epoch] + ':' + now;
            if (value > 0) {
                await app.redis.incrby(redis_key, value);
                await app.redis.expire(redis_key, epochs[epoch]);
            }
        }
        await app.redis.incrby(key, -1 * parseInt(value));
    }

    keys = await app.redis.keys('ztop:base:*');
    keys.sort();
    for (let key of keys) {
        str = '';
        key = key.replace('ztop:base:', '');

        for (let epoch in epochs) {
            var total = await get_total(app, 'ztop:' + key + ':' + epochs[epoch]);
            str += ('           ' + total.toLocaleString()).slice(-12);
            if (epoch == 'hour') await app.redis.setex('www:status:' + key, 3600, total);
        }
        out.push(str + '    ' + key);
    }

    var output = out.join('\n');
    await app.redis.setex("server-information", 60, output);
    await fs.writeFileSync('/tmp/ztop.txt', output, 'utf-8');
}

async function get_total(app, redis_base) {
    let keys = await app.redis.keys(redis_base + ':*');
    var total = 0;
    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        let value = await app.redis.get(key);
        total += parseInt(value) || 0;
    }
    return total;
}

function text(key, isDelayed) {
    return key + (isDelayed ? ' n': ' Y');
}

function memUsage(app) {
    return Math.floor(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB';
};