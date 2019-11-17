'use strict';

const set = new Set();

const streamConfig = {
    fullDocument: 'updateLookup'
};

module.exports = {
    async start(app, collection, match, f, limit) {
        try {
            const hostInfo = await app.db.command({
                hostInfo: 1
            });

            // Process any existing that match
            await iterate(app, await collection.find(match), f, limit, false);

            // Now process any in the oplog that match
            streamConfig.startAtOperationTime = hostInfo.operationTime;
            const stream = collection.watch(createStreamMatch(match), streamConfig);
            await iterate(app, stream, f, limit, true);
        } catch (e) {
            // 136 is stream died, ignore it and restart in a second
            if (e.code != 136) console.log(e);
        } finally {
            // start again
            await app.sleep(1000);
            this.start(app, collection, match, f, limit);
        }
    }
}

function createStreamMatch(match) {
    let keys = Object.keys(match);
    if (keys.length == 0) return [];
    let streamMatch = {};
    for (let key of keys) {
        streamMatch['fullDocument.' + key] = match[key];
    }
    return [{
        $match: streamMatch
    }];
}

async function iterate(app, iterator, f, limit, isStream) {
    while (await iterator.hasNext()) {
        while (set.size >= limit) await app.sleep(1); // don't flood the stack        
        call(app, f, (isStream ? (await iterator.next()).fullDocument : await iterator.next()));
    }
}

async function call(app, f, doc) {
    const s = Symbol();
    try {
        set.add(s);
        let now = Date.now();
        await f(app, doc);
        console.log(f.name + ': ' + (Date.now() - now) + 'ms');
    } catch (e) {
        console.log(e);
    } finally {
        set.delete(s);
    }

}