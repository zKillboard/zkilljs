const app = require('fundamen')('www');
async function f(app) {
	app = await app;
	await app.redis.set('www:status:server_started', app.server_started);	
	
    memUsage(app);
    zkbClearCheck(app);
    zkbHttpClearCheck(app);
}
f(app);

async function memUsage(app) {
    try {
        let usage = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024).toString() + 'MB';
        await app.redis.setex('zkilljs:www:memusage', 60, usage);
        await app.redis.setex('zkilljs:www:server_started', 60, app.server_started);
    } finally {
        setTimeout(memUsage.bind(null, app), 15000);
    }
};

async function zkbClearCheck(app) {
    try {
        let reset = await app.redis.get('zkb:clear');
        if (reset !== null) {
            let keys = await app.redis.keys('zkb*');
            for (let key of keys) await app.redis.del(key);
            console.log('zkb caches cleared');
        }
    } finally {
        setTimeout(zkbClearCheck.bind(null, app), 15000);
    }
}

async function zkbHttpClearCheck(app) {
    try {
        let reset = await app.redis.get('zkb:http_clear');
        if (reset !== null) {
            let keys = await app.redis.keys('zkb:http_cache*');
            for (let key of keys) await app.redis.del(key);
            console.log('zkb http caches cleared');
        }
    } finally {
        setTimeout(zkbHttpClearCheck.bind(null, app), 15000);
    }
}