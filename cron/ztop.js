module.exports = f;

var fs = require('fs');
var util = require('util');

async function f(app) {
    //await ztop(app);
}

async function ztop(app) {
    /*let keys = Object.keys(app.ztop).sort();
    let out = '\n';
    for (key of keys) {
    	out += key + ': ' + app.ztop[key] + '\n';
    	app.ztop[key] = 0;
    }
    fs.writeFileSync('/tmp/ztop.json', out, 'utf-8');*/
    //console.log(await app.redis.hgetall('ztop'));
}
