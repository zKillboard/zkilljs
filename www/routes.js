var express = require('express');
var router = express.Router();
module.exports = router;

addGet('/api/information/:type/:id/', 'api/information');
addGet('/api/statistics/:type/:id/', 'api/statistics');


async function doStuff(req, res, next, controllerFile, pugFile) {
    try {
        const file = res.app.root + '/www/routes/' + controllerFile + '.js';
        const controller = require(file);

        let result = await controller(req, res);

        if (result === null || result === undefined) {
            res.sendStatus(404);
        } else if (typeof result === "object") {
            if (result.json !== undefined) res.json(result.json);
            else res.render(pugFile, result);
        } else if (typeof result == "string") {
            res.redirect(result);
        }

    } catch (e) {
        console.log(e);
    }
}

function addGet(route, controllerFile, pugFile) {
    if (pugFile == undefined) pugFile = controllerFile;
    router.get(route, (req, res, next) => {
        doStuff(req, res, next, controllerFile, pugFile);
    });
}