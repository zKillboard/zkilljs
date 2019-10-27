module.exports = f;

async function f(app) {
    let promise = waaait(app);
    while (true) {
        console.log(promise);
        await app.sleep(1000);
    }
}


async function waaait(app) {
    await app.sleep(10000);
}