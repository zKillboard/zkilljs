'use strict';

module.exports = {
    async add(app, killmail_id, hash) {
        if (typeof killmail_id != 'number') killmail_id = parseInt(killmail_id);
        if (typeof hash != 'string') throw 'hash must be a string';
        if (killmail_id <= 0) throw 'Non-numeric or 0 killmail_id given';
        try {
            await app.db.killhashes.insertOne({
                killmail_id: killmail_id,
                hash: hash,
                'status': 'pending'
            });
        } catch (e) {
            if (e.code != 11000) { // Ignore duplicate entry error
                console.log(e);
            }
        }
    }
}