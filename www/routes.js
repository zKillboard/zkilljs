var express = require('express');
var router = express.Router({strict: true});
module.exports = router;

// Overview
addGet('/site/information/:type/:id.html', 'site/information', 'information.pug');
addGet('/site/killmails/:type/:id.html', 'site/killmails', 'kill-list.pug');
addGet('/site/killmail/row/:id.html', 'site/killmail', 'killmail-row.pug');

//addGet('/site/killmail/:id', 'site/detail', 'detail.pug');


addGet('/cache/1hour/api/information/:type/:id/:field.html', 'site/information', 'raw.pug');

addGet('/api/1hour/information/:type/:id.json', 'api/information');
addGet('/api/1hour/killmail/:id.json', 'api/killmail');
addGet('/api/1hour/statistics/:type/:id.json', 'api/statistics');
addGet('/api/1hour/killmails/recent/:type/:id.json', 'api/killmails');
addGet('/api/1hour/killmails/:date/:type/:id.json', 'api/killmails-daily');

router.get('/*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

async function doStuff(req, res, next, controllerFile, pugFile) {
    try {
        const file = res.app.root + '/www/routes/' + controllerFile + '.js';
        const controller = require(file);

        let result = await controller(req, res);

        res.set('Cache-Control', 'public, max-age=' + (result.maxAge || 0));

        if (result === null || result === undefined) { 
            res.sendStatus(404);
        } else if (typeof result === "object") {
            console.log('object');
            console.log(result, pugFile);
            if (pugFile !== undefined) res.render(pugFile, result);
            else if (result.json !== undefined) res.json(result.json);
        } else if (typeof result == "string") {
            res.redirect(result);
        }

    } catch (e) {
        console.log(e);
    }
}

function addGet(route, controllerFile, pugFile) {
    //if (pugFile == undefined) pugFile = controllerFile;
    router.get(route, (req, res, next) => {
        doStuff(req, res, next, controllerFile, pugFile);
    });
}