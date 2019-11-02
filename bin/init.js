module.exports = f;

const redis = require('async-redis').createClient({
    retry_strategy: redis_retry_strategy
});
const phin = require('phin').defaults({
    'method': 'get',
    'headers': {
        'User-Agent': 'zkillboard.com'
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
    app.waitfor = async function (promises) {
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
    const dbName = 'zkillboard';
    const client = new MongoClient(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    try {
        await client.connect();
    } catch (e) {
        // server not up? wait 15 seconds and exit, let the daemon restart us
        await app.sleep(15);
        process.exit();
    }
    app.db = client.db(dbName);
    var collections = await app.db.listCollections().toArray();
    for (let i = 0; i < collections.length; i++) {
        console.log('Prepping ' + collections[i].name);
        app.db[collections[i].name] = app.db.collection(collections[i].name);
    }

    return app;
}