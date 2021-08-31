var express = require('express');
var router = express.Router({
    strict: true
});
module.exports = router;

// Site
addGet('/index.html', 'site/index', 'index.pug');
addGet('/site/information/:type/:id.html', 'site/information.js', 'information.pug');
addGet('/site/killmails/:type/:id.json', 'site/kill-list.js', 'kill-list.pug');
addGet('/site/statistics/:type/:id.html', 'site/statistics.js', 'statistics.pug');
addGet('/site/toptens/:epoch/:type/:id.html', 'site/toptens.js');
addGet('/site/ztop.txt', 'site/ztop.js', 'ztop.pug');

// Cached endpoints
addGet('/cache/1hour/killmail/:id.html', 'site/killmail.js', 'killmail.pug');
addGet('/cache/1hour/killmail/:id/remaining.html', 'site/killmail-remaining.js', 'killmail-remaining.pug');
addGet('/cache/1hour/killmail/row/:id.html', 'site/killmail-row.js', 'killmail-row.pug');
addGet('/cache/1hour/killmails/:type/:id.json', 'site/kill-list.js');
addGet('/cache/1hour/toptens/:epoch/:type/:id.html', 'site/toptens.js', 'toptens.pug');
addGet('/cache/1hour/autocomplete/', 'site/autocomplete.js');

addGet('/cache/1hour/api/information/:type/:id/:field.html', 'site/information', 'raw.pug');
addGet('/cache/1hour/stats_box/:type/:id.json', 'api/stats_box.js');

// API endpoints
addGet('/api/1hour/information/:type/:id.json', 'api/information.js');
addGet('/api/1hour/killmail/:id.json', 'api/killmail.js');
addGet('/api/1hour/statistics/:type/:id.json', 'api/statistics.js');
addGet('/api/1hour/killmails/recent/:type/:id.json', 'api/killmails.js');
addGet('/api/1hour/killmails/:date/:type/:id.json', 'api/killmails-daily.js');

addGet('/api/mongo.json', 'api/mongo.js');

addGet('/:type/:id', 'site/index', 'index.pug');
addGet('/', 'site/index', 'index.pug');

addGet('/robots.txt', 'site/robotstxt.js', 'robotstxt.pug');

const pug = require('pug');
var compiled = {};

async function doStuff(req, res, next, controllerFile, pugFile) {
    const app = req.app.app;
    try {
        const file = res.app.root + '/www/routes/' + controllerFile;
        const controller = require(file);

        req.verify_query_params = verify_query_params;

        var rendered = await app.redis.get('zkilljs:rendered:' + req.url);
        if (rendered != null) {
            console.log('sending redis cache result');
            res.send(rendered);
            res.end();
            return;
        }

        let result = wrap_promise(controller(req, res));

        var now = app.now();
        while (result.isFinished() == false) {
            if ((app.now() - now) > 15) {
                res.redirect(req.url);
                return;
            }
            await app.sleep(1);
        }
        result = await result;

        // let result = await controller(req, res);
        if (result == undefined) result = null;
        var maxAge = Math.min(3600, (result == null ? 0 : (result.maxAge || 0)));
        if (result != undefined && result.content_type != undefined) res.setHeader("Content-Type", result.content_type)

        res.set('Cache-Control', 'public, max-age=' + maxAge);
        
        if (result === null || result === undefined) {
            res.sendStatus(404);
        } else if (typeof result === "object") {
            if (pugFile !== undefined) {
                var rendered = (maxAge > 0 ? await app.redis.get('zkilljs:rendered:' + req.url) : null);
                if (rendered != null) {
                    console.log('sending redis cache result');
                    res.send(rendered);
                } else {
                    if (compiled[pugFile] == null) {
                        compiled[pugFile] = pug.compileFile(__dirname + '/views/' + pugFile);
                    }
                    var o = {};
                    Object.assign(o, res.locals);
                    Object.assign(o, result);

                    var render = compiled[pugFile];
                    var rendered = render(o, {
                        debug: true,
                        cache: false
                    });
                    res.send(rendered);

                    if (maxAge > 0) await app.redis.setex('zkilljs:rendered:' + req.url, maxAge, rendered);

                    // The above is several times faster, TODO figure out why... 
                    //res.render(pugFile, result);
                }
            } else if (result.json !== undefined) res.json(result.json);
        } else if (typeof result == "string") {
            res.redirect(result);
        } else if (result === 204) {
            res.status(204);
        }
        res.end();
        result = {}; // Clear it out for quicker GC
    } catch (e) {
        console.log(e);
    } finally {
        await app.redis.del('req:' + req.url);
    }
}

function addGet(route, controllerFile, pugFile) {
    //if (pugFile == undefined) pugFile = controllerFile;
    router.get(route, (req, res, next) => {
        doStuff(req, res, next, controllerFile, pugFile);
    });
}

function verify_query_params(req, valid_array) {
    var base_url = (req.alternativeUrl != undefined ? req.alternativeUrl : req._parsedUrl.pathname);
    var query_params = req.query;

    var required = valid_array.required || [];
    delete valid_array.required;
    var valid_keys = Object.keys(valid_array);
    var given_keys = Object.keys(query_params);

    // Make sure all required fields are present
    for (const req_parameter of required) {
        if (query_params[req_parameter] === undefined || query_params[req_parameter].length == 0) return rebuild_query(base_url, query_params, valid_array, required);
    }

    var last_key = '';
    var rebuild_required = false;
    for (const key of given_keys) {
        if (key <= last_key) rebuild_required = true;

        // Verify any unsupported parameters are not present
        if (valid_keys.indexOf(key) === -1) {
            rebuild_required = true;; // This key does not belong here
        }

        // Make sure its not just an empty value
        if (query_params[key].length == 0) {
            return null; // Just 404 in this case, don't attempt rebuild
        }

        // Verify params are mapped to proper types
        switch (valid_array[key]) {
        case 'string':
            // already checked for non-empty value, we're good, move on
            break;
        case 'integer':
            var num = Number.parseInt(query_params[key]);
            if (isNaN(num)) return null; // Just 404 in this case, don't attempt rebuild
            break;
        default:
            // If the data type passed is an array, then we need to make sure our value is within that array
            if (Array.isArray(valid_array[key])) {
                console.log(key, query_params[key], valid_array[key]);
                if (req.query[key].indexOf(query_params[key]) == -1) rebuild_required = true;
            } else {
                // matching value provided, make sure we have that value
                if (query_params[key] != ('' + valid_array[key])) rebuild_required = true; // This key does not belong here;
            }
        }

        last_key = key;
    }
    if (rebuild_required) {
         return rebuild_query(base_url, query_params, valid_array, required);
    }

    return true;
}

function rebuild_query(base_url, query_params, valid_array, required) {
    var rebuild = {};
    for (const key of required) {
        switch (valid_array[key]) {
        case 'integer':
            rebuild[key] = (query_params[key] || 0);
            break;
        case 'string':
            rebuild[key] = query_params[key];
            break;
        default:
            if (Array.isArray(valid_array[key])) {
                rebuild[key] = valid_array[key][0]; // first value is default
            } else {
                rebuild[key] = valid_array[key];
            }
        }
        delete query_params[key];
        delete valid_array[key];
    }

    // Iterate the remaining keys
    var valid_keys = Object.keys(valid_array);
    var given_keys = Object.keys(query_params);
    for (const key of valid_keys) {
        if (query_params[key] == undefined) continue;

        switch (valid_array[key]) {
        case 'integer':
            rebuild[key] = (query_params[key] || 0);
            break;
        case 'string':
            rebuild[key] = query_params[key];
            break;
        default:
            rebuild[key] = valid_array[key];
        }
    }

    keys = Object.keys(rebuild).sort();
    var url = base_url;
    var first = true;
    var added = false;
    for (const key of keys) {
        if (first) url += '?';
        first = false;
        if (added) url += '&';
        added = true;
        url += (key + '=' + rebuild[key]);
    }
    return url;
}

function wrap_promise(promise) {
    // Don't create a wrapper for promises that can already be queried.
    if (promise.isResolved) return promise;
    
    var isFinished = false;

    var isResolved = false;
    var isRejected = false;

    // Observe the promise, saving the fulfillment in a closure scope.
    var result = promise.then(
       function(v) { isFinished = true; return v; }, 
       function(e) { isFinished = true; throw e; }
    );
    result.isFinished = function() { return isFinished};
    return result;
}