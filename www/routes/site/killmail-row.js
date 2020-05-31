'use strict';

module.exports = getData;

async function getData(req, res) {
    const app = req.app.app;

    var killmail_id = parseInt(req.params.id);
    return await app.util.killmails.prepKillmailRow(app, killmail_id);
}