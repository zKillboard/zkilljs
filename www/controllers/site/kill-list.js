'use strict';

module.exports = {
   paths: ['/site/killmails.json', '/cache/1hour/killmails.json'],
   get: get,
   ttl: 86400
}

let batch_size = 50;
const cache = {};
function clear_kill_list_cache() {
    cache = {};
}
setInterval(clear_kill_list_cache, 3600000);

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

    let match = await app.util.match_builder(app, req, 'all');

    let record = await app.db.statistics.findOne({type: match.type, id: match.id});
    if (record == null) record = {};

    // If too many killmails come in too quickly this could lead to too many redirects, so we'll cache
    // a single sequence per second
    let now = app.now();
    let sequence_key = now + '-' + req.params.type + '-' + req.params.id;
    if (sequences[sequence_key] == undefined) sequences[sequence_key] = record.sequence | 0; 

    let valid = {
        modifiers: 'string',
        page: 'integer',
        sequence: sequences[sequence_key],
        type: 'string',
        id: 'string',
        required: ['page', 'sequence', 'v', 'type', 'id'],
        v: app.server_started
    }
    req.alternativeUrl = '/cache/1hour/killmails.json';
    valid = req.verify_query_params(req, valid);
    if (valid !== true) {
        return {redirect: valid};
    }
    console.log(match);

    let total_kl = (record.killed | 0) + (record.lost | 0);

    let killmails;
    let page = Math.max(1, Math.min(10, parseInt(req.query['page']))); // cannot go below 0 or above 9
    page--;

    let collections = ['killmails_7', 'killmails_90', 'killmails'];
    for (let collection of collections) {
        killmails = [];
        let result = await app.db[collection].find(match.match)
            .sort({ killmail_id: -1 })
            .skip(page * batch_size) // faster without a limit... 
            //.limit(batch_size)
            .batchSize(batch_size);
        while (await result.hasNext()) {
            killmails.push((await result.next()).killmail_id)
            if (killmails.length >= batch_size) break;
        }
        await result.close();
        if (killmails.length >= batch_size) break;
    }

    return {
        json: killmails,
        ttl: 3600
    };
}