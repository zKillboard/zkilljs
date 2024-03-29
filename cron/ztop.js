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

let last_second_exec = 0;

async function f(app) {
    while (app.zinitialized != true) await app.sleep(100);

    if (last_second_exec == 0) last_second_exec = app.now();
    await ztop(app);
}

async function cleanup(app) {
    await clear_keys(app, await app.redis.keys('zkilljs:ztop:*'));
}

async function clear_keys(app, keys) {
    for (let key of keys) {
        await app.redis.del(key); 
    }
}

async function ztop(app) {
    if (await app.redis.get('cleanup_ztop') == 'true') {
        await cleanup(app);
        await app.redis.del('cleanup_ztop');
    }

    let out = [];

    const now = app.now();

    out.push([new Date()]);

    let t = padLeftSlice(memUsage(app) + ' (cron)', -16) + padLeftSlice(await app.redis.get('zkilljs:www:memusage') + ' (www)', -16);
    let last_check = (app.now() - last_second_exec);
    if (last_check >= 30) await app.redis.setex("RESTART", 120, "true"); // something not right, taking too long
    t += '   (' + last_check + ' seconds)';
    app.rate_limit = await app.util.assist.get_rate_limit();
    t += '     rate limit: ' + app.rate_limit;
    last_second_exec = app.now();
    out.push(t);
    out.push([]);

    t = '';
    t += padLeftSlice(app.dbstats.pending.toLocaleString() + (app.dbstats.pending >= 1000 ? '+' : '') + ' pending', -20);
    t += padLeftSlice(app.dbstats.fetched.toLocaleString() + (app.dbstats.fetched >= 1000 ? '+' : '') + ' fetched', -20);
    t += padLeftSlice(app.dbstats.parsed.toLocaleString() + (app.dbstats.parsed >= 1000 ? '+' : '') + ' parsed', -20);
    t += padLeftSlice(app.dbstats.prices.toLocaleString() + ' - prices', -22);
    out.push(t);
    out.push([]);

    let epoch_keys = Object.keys(epochs);
    let last_epoch = epoch_keys[epoch_keys.length - 1];

    let str = '';
    for (let epoch in epochs) {
        str += (('           ' + (epochs[epoch])).toLocaleString()).slice(-12);
        if (epoch == last_epoch) str += '         #/s';
    }
    out.push(str + '    seconds');

    const ztops = app.util.ztop.get_ztops();

    let keys = Object.keys(ztops);
    let second = app.now();
    second = second - (second % 60);

    for (let key of keys) {
        await app.redis.setex('zkilljs:ztop:base:' + key, 3600, 'true');
        for (let epoch in epochs) {
            if (epoch == 'moment') continue;
            let rkey = 'zkilljs:ztop:' + key + ':' + epoch + ':' + second;
            await app.redis.incrby(rkey, ztops[key]);
            await app.redis.expire(rkey, epochs[epoch] - 1);
        }
    }

    let base_keys = await app.redis.keys('zkilljs:ztop:base:*');
    base_keys.sort();
    for (let key of base_keys) {
        str = '';
        key = key.replace('zkilljs:ztop:base:', '');

        for (let epoch in epochs) {
            const total = (epoch == 'moment' ? ztops[key] || 0 : await get_total(app, 'zkilljs:ztop:' + key + ':' + epoch));
            str += ('           ' + total.toLocaleString()).slice(-12);
            if (epoch == last_epoch) {
                str += ('           ' + Math.floor(total / epochs[epoch]).toLocaleString()).slice(-12);
                await app.redis.setex('www:status:' + key, 3600, total);
            }
            if (epoch == 'hour' && key == 'killmail_process_parsed') {
                await app.redis.setex('www:status:mails_parsed', 300, total);
            }
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

function padLeftSlice(text, lastChars) {
    if (text.length == Math.abs(lastChars)) return text;
    if (text.length > Math.abs(lastChars)) return text.slice(lastChars);
    while (text.length < Math.abs(lastChars)) text = ' ' + text;
    return text;
}

function memUsage(app) {
    return Math.floor(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB';
};