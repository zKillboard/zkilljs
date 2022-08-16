'use strict';

module.exports = {
    exec: f,
    span: 5
}

const fs = require('fs');
const util = require('util');

const epochs = {
    moment: 5,
    minute: 60,
    five: 300,
    hour: 3600,
    //day: 86400,
}

let first_run = true;

async function f(app) {
    while (app.zinitialized != true) await app.sleep(100);

    await ztop(app);
    if (first_run) {
        cleanup(app);
        first_run = false;
    }
}

async function cleanup(app) {
    await clear_keys(app, await app.redis.keys('zkb:ztop:*'));
    await clear_keys(app, await app.redis.keys('ztop:*'));
}

async function clear_keys(app, keys) {
    for (let key of keys) {
        await app.redis.del(key); 
    }
}

async function ztop(app) {
    let out = [];

    const now = app.now();

    out.push([new Date()]);

    out.push([
        text('Fetching', false),
        text('Parsing', app.delay_parse), 
        text('Prepping', app.delay_prep), 
        text('Statting', app.delay_stat), 
        text('Dailies', !app.fetch_dailies)
        ].join(', '));
    out.push(memUsage(app));
    out.push([]);

    let str = '';
    for (let epoch in epochs) {
        str += (('           ' + (epochs[epoch])).toLocaleString()).slice(-12);
    }
    out.push(str + '    seconds');

    const ztops = app.util.ztop.get_ztops();

    let keys = Object.keys(ztops);
    let second = app.now();
    second = second - (second % 5);

    for (let key of keys) {
        await app.redis.setex('ztop:base:' + key, 3600, 'true');
        for (let epoch in epochs) {
            let rkey = 'ztop:' + key + ':' + epoch + ':' + second;
            await app.redis.incrby(rkey, ztops[key]);
            await app.redis.expire(rkey, epochs[epoch] - 1);
        }
    }


    let base_keys = await app.redis.keys('ztop:base:*');
    base_keys.sort();
    for (let key of base_keys) {
        str = '';
        key = key.replace('ztop:base:', '');

        for (let epoch in epochs) {
            const total = (epoch == 'moment' ? ztops[key] || 0 : await get_total(app, 'ztop:' + key + ':' + epoch));
            str += ('           ' + total.toLocaleString()).slice(-12);
            // if (epoch == 'hour') await app.redis.setex('www:status:' + key, 3600, total);
        }
        out.push(str + '    ' + key);
    }


    let output = out.join('\n');
    await app.redis.setex("server-information", 60, output);
    await fs.writeFileSync('/tmp/ztop.txt', output, 'utf-8');
}

async function get_total(app, redis_base) {
    let keys = await app.redis.keys(redis_base + ':*');
    let total = 0;
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