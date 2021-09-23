'use strict';


module.exports = {
    async start(app, collection, match, f, limit = 99999, sort = {}) {
        const streamConfig = {
            fullDocument: 'updateLookup'
        };
        const set = new Set();

        let count = 0;
        try {
            const hostInfo = await app.db.command({
                hostInfo: 1
            });

            // Process any existing that match
            count = await iterate(app, await collection.find(match).sort(sort).limit(limit), f, false, set);

            // Now process any in the oplog that match
            /*streamConfig.startAtOperationTime = hostInfo.operationTime;
            const stream = collection.watch(createStreamMatch(match), streamConfig);
            count += await iterate(app, stream, f, true, set);*/
        } catch (e) {
            // 136 is stream died, ignore it and restart in a second
            if (e.code != 136) console.log('StremWatcher exception', '\n', match, '\n', e);
        } finally {
            if (app.bailout) return;
            while (set.size > 0) await app.sleep(1);            
            if (count == 0) await app.sleep(1000);
            this.start(app, collection, match, f, limit, sort); // start again
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

async function iterate(app, iterator, f, isStream, set) {
    let count = 0;
    while (await iterator.hasNext()) {
        while (set.size >= 100) await app.sleep(1); // don't flood the stack        
        call(app, f, (isStream ? (await iterator.next()).fullDocument : await iterator.next()), set);
        count++;
    }
    return count;
}

async function call(app, f, doc, set) {
    const s = Symbol();
    try {
        set.add(s);
        //let now = Date.now();
        await f(app, doc);
        //console.log(f.name + ': ' + (Date.now() - now) + 'ms');
    } catch (e) {
        console.log(e);
    } finally {
        set.delete(s);
    }

}