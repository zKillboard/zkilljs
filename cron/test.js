module.exports = f;

const set = new Set();
var firstRun = true;

async function f(app) {
    if (firstRun) {
        start(app);
        firstRun = false;
    }
    while(true) await app.sleep(1000);
}

async function start(app) {
    var mails = await app.db.killhashes.find({
        status: 'pending'
    }).batchSize(1000);

     while (await mails.hasNext()) {
        let mail = await mails.next();
        console.log(set.size);
        parseEm(app, mail);
        while (set.size >= 500) await app.sleep(10);
        //await app.sleep(13);
    }

    await app.sleep(1000);
    start(app);
}

async function parseEm(app, mail) {
	set.add(mail);
    await app.sleep(1000);
    set.delete(mail);
}