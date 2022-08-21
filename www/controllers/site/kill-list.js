'use strict';

module.exports = {
   paths: ['/site/killmails/:type/:id.json', '/cache/1hour/killmails/:type/:id.json'],
   get: get
}

var batch_size = 100;

const sequences = {};
function cleanupSequences() {
    let now = Math.floor(Date.now() / 1000);
    for (let key of Object.keys(sequences)) {
        let values = key.split('-');
        let time = parseInt(values[0]);
        if (time < now) delete sequences[key];
    }
}
setInterval(cleanupSequences, 15000);

async function get(req, res) {
    const app = req.app.app;

    var match = await app.util.match_builder(app, req, 'all');

    var record = await app.db.statistics.findOne({type: match.type, id: match.id});
    if (record == null) return { json: [] }; // return an empty list

    // If too many killmails come in too quickly this could lead to too many redirects, so we'll cache
    // a single sequence per second
    let now = app.now();
    let sequence_key = now + '-' + req.params.type + '-' + req.params.id;
    if (sequences[sequence_key] == undefined) sequences[sequence_key] = record.sequence;

    var valid = {
        modifiers: 'string',
        page: 'integer',
        sequence: sequences[sequence_key],
        required: ['page', 'sequence'],
    }
    req.alternativeUrl = '/cache/1hour/killmails/' + req.params.type + '/' + req.params.id + '.json';
    var valid = req.verify_query_params(req, valid);
    if (valid !== true) {
        return {redirect: valid, ttl: 0};
    }

    var page = Math.max(0, Math.min(9, req.query['page'])); // cannot go below 0 or above 9

    var killmails;
    var collections = ['killmails_7', 'killmails_90', 'killmails'];
    for (var i = 0; i < collections.length; i++) {
        let result = await app.db[collections[i]].find(match.match)
            .sort({ killmail_id: -1 })
            .skip(page * batch_size) // faster without a limit... 
            .limit(batch_size)
            .batchSize(batch_size);
        killmails = [];
        while (await result.hasNext()) {
            killmails.push((await result.next()).killmail_id)
            if (killmails.length >= batch_size) break;
        }
        if (killmails.length >= batch_size) break;
    }

    return {
        json: killmails,
        ttl: 3600
    };
}

function get_sum(record, epoch) {
    if (record[epoch] == undefined || record[epoch] == 0) return 0;
    return (record[epoch].killed) || (record[epoch].lost || 0);
}