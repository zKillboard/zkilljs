#!/usr/bin/env node

var app = undefined;
async function getApp() {
    if (app === undefined) {
        var req = require('./init.js');
        app = await req();
    }
    return app;
}

if (process.argv[2]) {
    debug(process.argv[2]);
    return;
}

let tasks = {
    'listen_redisq.js': {
        span: 60
    },
    'update_prices': {
        span: 1
    },

    'fetch_mails.js': {
        span: 1
    },
    'fetch_locations.js': {
        span: 1
    },
    'update_information.js': {
        span: 1,
        iterations: 10
    },
    'parse_mails': {
        span: 1
    },
    'do_stats': {
        span: 1
    },
    'fetch_dailies': {
        span: 1
    },
    'update_factions.js': {
        span: 86400
    },
    'fetch_wars.js': {
        span: 9600
    },
    'fetch_warmails': {
        span: 1
    },
}

// Clear existing running keys
setTimeout(function () {
    clearRunKeys(undefined);
}, 1);
async function clearRunKeys(app) {
    app = await getApp();
    let runkeys = await app.redis.keys('crinstance:running*');
    for (let i = 0; i < runkeys.length; i++) {
        await app.redis.del(runkeys[i]);
    }
    setTimeout(function () {
        runTasks(app, tasks);
    }, 1);
}

async function runTasks(app, tasks) {
    if (await app.redis.get("STOP") != null || await app.redis.get("RESTART") != null) {
        console.log("STOPPING");
        app.bailout = true;
        while ((await app.redis.keys("crinstance:running:*")).length > 0) {
            console.log('Running: ', await app.redis.keys("crinstance:running:*"));
            await app.sleep(1000);
        }
        if (await app.redis.get("RESTART") != null) {
            await app.redis.del("RESTART");
            console.log("Restarting...");
            process.exit();
        }
        console.log("STOPPED");
        return;
    }

    let now = Date.now();
    now = Math.floor(now / 1000);

    let arr = Object.keys(tasks);
    for (let i = 0; i < arr.length; i++) {
        let task = arr[i];
        let taskConfig = tasks[task];
        let currentSpan = now - (now % taskConfig.span);
        let iterations = taskConfig.iterations || 1;

        for (let j = 0; j < iterations; j++) {
            let curKey = 'crinstance:current:' + j + ':' + task + ':' + currentSpan;
            let runKey = 'crinstance:running:' + j + ':' + task;

            if (await app.redis.get(curKey) != 'true' && await app.redis.get(runKey) != 'true') {
                await app.redis.setex(curKey, taskConfig.span || 3600, 'true');
                await app.redis.setex(runKey, 3600, 'true');

                f = require('../cron/' + task);
                runTask(task, f, app, curKey, runKey, j);
            }
        }
    }

    await app.sleep(Math.max(1, 1 + (Date.now() % 1000)));
    runTasks(app, tasks);
}

async function runTask(task, f, app, curKey, runKey, iteration) {
    try {
        //console.log(task + ' starting');
        await f(app, iteration);
    } catch (e) {
        console.log(task + ' failure:');
        console.log(e);
    } finally {
        //console.log(task + ' finished');
        await app.redis.del(runKey);
    }
}

async function debug(task) {
    app = await getApp();
    app.debug = true;
    console.log('Debugging ' + task);
    let f = require('../cron/' + process.argv[2]);
    await runTask(process.argv[2], f, app, '0', '0');
    await app.sleep(1000);
    console.log('Exiting debug');
    process.exit();
}

var watch = require('node-watch');

watch('restart.txt', {
    recursive: true
}, async function (evt, name) {
    await app.redis.set("RESTART", "true");
});