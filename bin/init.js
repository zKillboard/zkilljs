module.exports = f;

/*const originalLogger = console.log;
console.log = function(text) {
    var d = new Date();
    var time = ("" + d.getHours()).padStart(2, '0') + ":" + ("" + d.getMinutes()).padStart(2, '0') + ":" + ("" + d.getSeconds()).padStart(2, '0');
    originalLogger(time , " > ", text);
}*/

const redis = require('async-redis').createClient({
    retry_strategy: redis_retry_strategy
});
const phin = require('phin').defaults({
    'method': 'get',
    'headers': {
        'User-Agent': 'zkillboard.dev (zkilljs)'
    }
});

function redis_retry_strategy(options) {
    if (options.error && options.error.code === 'ECONNREFUSED') {
        // End reconnecting on a specific error and flush all commands with
        // a individual error
        return new Error('The server refused the connection');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
        // End reconnecting after a specific timeout and flush all commands
        // with a individual error
        return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
        // End reconnecting with built in error
        return undefined;
    }
    // reconnect after
    return Math.min(options.attempt * 100, 3000);
}

async function f() {
    const app = {};

    app.util = {
        entity: require('../util/entity.js'),
        info: require('../util/info.js'),
        killmails: require('../util/killmails.js'),
        //points: require('../util/points.js'),
        price: require('../util/price.js'),
        stats: require('../util/stats.js'),
    };

    app.cache = {
        prices: {}
    };

    app.debug = false;
    app.bailout = false;
    app.no_api = false;
    app.no_parsing = false;
    app.no_stats = false;
    app.error_count = 0;
    app.phin = phin;
    app.fetch = async function (url, parser, failure, options) {
        try {
            return await parser(app, await phin(url), options);
        } catch (e) {
            return failure(app, e);
        }
    };
    app.redis = redis;
    app.esi = 'https://esi.evetech.net';
    app.waitfor = async function (promises, key = undefined) {
        for (let i = 0; i < promises.length; i++) {
            await promises[i];
        }
    }

    app.sleep = function sleep(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms)
        });
    }

    const MongoClient = require('mongodb').MongoClient;
    const url = 'mongodb://localhost:27017?maxPoolSize=500';
    const dbName = 'zkilljs';
    const client = new MongoClient(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 3600000,
        socketTimeoutMS: 3600000,
    });

    try {
        await client.connect();
    } catch (e) {
        // server not up? wait 30 seconds and exit, let the daemon restart us
        await app.sleep(30);
        process.exit();
    }
    app.db = client.db(dbName);
    var collections = await app.db.listCollections().toArray();
    for (let i = 0; i < collections.length; i++) {
        console.log('Prepping ' + collections[i].name);
        app.db[collections[i].name] = app.db.collection(collections[i].name);
    }

    var Database = require('../util/mysql.js');
    var mysql = new Database({
        host: 'localhost',
        user: 'zkilljs',
        password: 'zkilljs',
        database: 'zkilljs'
    });
    app.mysql = mysql;

    app.zincr = function (key) {
        let now = Math.floor(Date.now() / 1000) * 1000;
        if (lastsecond != now) {
            lastsecond = now;
            zincrcount = 0;
        }
        if (ztopindexes.indexOf(key) == -1) ztopindexes.push(key);
        zincrcount++;
        let z = now + zincrcount;
        app.redis.zadd('zkb:ztop:' + key, z, z);
    };

    // Special case, killhashes will be mapped to original zkillboard's esimails collection
    // We don't need to double this data set on the server.... 
    var zdb = client.db('zkillboard');
    app.db.rawmails = zdb.collection('esimails');

    globalapp = app;
    return app;
}

let lastsecond = 0;
let zincrcount = 0;
let ztopindexes = [];
let globalapp = undefined;

setTimeout(clearIndexes, 1001);

async function clearIndexes() {
    try {
        if (globalapp == undefined) return;
        let app = globalapp;

        let now = Math.floor(Date.now() / 1000) * 1000;

        for (let i of ztopindexes) {
            let key = 'zkb:ztop:' + i;
            await app.redis.zremrangebyscore(key, '-inf', now - 300000);
            let size = await app.redis.zcard('zkb:ztop:' + i);
            await app.redis.hset('ztop', i, size);
        }
    } catch (e) {
        console.log(e);
    }
    setTimeout(clearIndexes, 1001);
}

function memUsage() {
    var used = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`Using approximately ${Math.round(used * 100) / 100} MB`);
    setTimeout(memUsage, 1000);
}
memUsage();
