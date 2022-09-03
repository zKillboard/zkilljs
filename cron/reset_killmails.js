'use strict';

module.exports = {
	exec: f,
	span: 1
}

async function f(app) {
	while (app.zinitialized != true) await app.sleep(100);

	let reset_mail = await app.db.killhashes.findOne({reset: true});
	if (reset_mail == null) return;

	let killmail = await app.db.killmails.findOne({killmail_id: reset_mail.killmail_id});

	if (killmail != null) {
		console.log(killmail);
		if (await app.db.killmails_7.countDocuments({killmail_id: killmail.killmail_id})) await app.util.killmails.remove_killmail(app, 'killmails_7', killmail, 'week');
		if (await app.db.killmails_90.countDocuments({killmail_id: killmail.killmail_id})) await app.util.killmails.remove_killmail(app, 'killmails_90', killmail, 'recent');
		await app.util.killmails.remove_killmail(app, 'killmails', killmail, 'alltime');
	}

	await app.db.killhashes.updateOne({killmail_id: reset_mail.killmail_id}, {$set: {status: 'pending'}, $unset: {reset: 1}});

	console.log('Reset killmail', reset_mail.killmail_id);
}