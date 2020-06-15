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

function createTaskSettings(span = 1, iterations = 0, offset = 0) {
    return {
        span: span,
        iterations: iterations,
        offset: offset
    }
}

const tasks = {
    // maintenance fun
    'update_prices': createTaskSettings(1),
    'update_factions.js': createTaskSettings(60),
    'update_information.js': createTaskSettings(1),
    'fetch_locations.js': createTaskSettings(1),
    'update_alliance_membercounts.js': createTaskSettings(3600),
    
    // killmail producers
    'listen_redisq.js': createTaskSettings(15),
    'fetch_wars.js': createTaskSettings(9600),
    'fetch_warmails': createTaskSettings(1),
    'fetch_dailies': createTaskSettings(86400, 0, -43200),

    // killmail consumers
    'fetch_mails.js': createTaskSettings(1),
    'parse_mails.js': createTaskSettings(1),
    'do_activity.js': createTaskSettings(1),

    // statistics
    'update_stats.js': createTaskSettings(1),
    'update_stats_prepare.js': createTaskSettings(1),
    'update_stats_cleanup.js': createTaskSettings(1),
    'publish_stats_updates.js': createTaskSettings(5),

    //'ztop.js': createTaskSettings(1),
}

// Clear existing running keys
setTimeout(function () {
    clearRunKeys();
}, 1);
async function clearRunKeys() {
    let app = await getApp();
    let runkeys = await app.redis.keys('crin:running*');
    for (let i = 0; i < runkeys.length; i++) {
        await app.redis.del(runkeys[i]);
    }
    setTimeout(function () {
        runTasks(app, tasks);
    }, 1);
}

async function runTasks(app, tasks) {
    try {
        if (await app.redis.get("STOP") != null || await app.redis.get("RESTART") != null) {
            console.log("STOPPING");
            app.bailout = true;
            app.no_parsing = true;
            app.no_stats = true;
            while ((await app.redis.keys("crin:running:*")).length > 0) {
                console.log('Running: ', await app.redis.keys("crin:running:*"));
                await app.sleep(1000);
            }
            if (await app.redis.get("RESTART") != null) {
                await app.redis.del("RESTART");
                console.log("Restarting...");
                process.exit();
            }
            console.log("STOPPED");
            process.exit();
        }

        let now = Date.now();
        now = Math.floor(now / 1000);

        let arr = Object.keys(tasks);
        for (let i = 0; i < arr.length; i++) {
            let task = arr[i];
            let taskConfig = tasks[task] || {};
            let currentSpan = now - (now % (taskConfig.span || 1)) + (taskConfig.offset || 0);
            let iterations = taskConfig.iterations || 1;

            for (let j = 0; j < iterations; j++) {
                let curKey = 'crin:current:' + j + ':' + task + ':' + currentSpan;
                let runKey = 'crin:running:' + j + ':' + task;

                if (await app.redis.get(curKey) != 'true' && await app.redis.get(runKey) != 'true') {
                    await app.redis.setex(curKey, taskConfig.span || 3600, 'true');
                    await app.redis.setex(runKey, 3600, 'true');

                    f = require('../cron/' + task);
                    runTask(task, f, app, curKey, runKey, j);
                }
            }
        }
    } finally {
        await app.sleep(Math.max(1, 1 + (Date.now() % 1000)));
        runTasks(app, tasks);
    }
}

async function runTask(task, f, app, curKey, runKey, iteration) {
    try {
        //console.log(task + ' starting');
        await f(app, iteration);
    } catch (e) {
        console.log(task + ' failure:');
        console.log(e);
        await app.redis.del(curKey);
        await app.redis.del(runKey);
    } finally {
        //console.log(task + ' finished');
        await app.redis.del(runKey);
        if (app.bailout == true) await app.redis.del(curKey); // Bailed, probably didn't get to finish
    }
}

async function debug(task) {
    app = await getApp();
    app.debug = true;
    console.log('Debugging ' + task);
    let f = require('../cron/' + process.argv[2]);
    await runTask(process.argv[2], f, app, '0', '0');
    console.log("Debug finished");
}

var watch = require('node-watch');

watch('restart.txt', {
    recursive: true
}, async function (evt, name) {
    await app.redis.set("RESTART", "true");
});
