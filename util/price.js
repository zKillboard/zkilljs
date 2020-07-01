let price_cache = {};

const price = {
    async get(app, item_id, date, skip_fetch) {
        if (date == undefined) throw "Must provide date";

        if (typeof date == 'string') date = date.substr(0, 10);
        else date = this.format_date(date);
        let rkey = date + ':' + item_id;
        let cached = await app.redis.get(rkey);
        if (cached != null) {
            return parseFloat(cached);
        }

        const fixed_price = await price.get_fixed_price(app, item_id);
        if (fixed_price != undefined) return this.cacheIt(app, rkey, fixed_price);

        let info = await app.util.entity.info(app, 'item_id', item_id, true);
        if (info.category_id == 66) {
            const build_price = await get_build_price(app, item_id, date);
            if (build_price != undefined && build_price > 0.01) return this.cacheIt(app, rkey, build_price);
        }

        return this.cacheIt(app, rkey, await fetch(app, item_id, date, skip_fetch));
    },

    cacheIt(app, rkey, price) {
        //price_cache[rkey] = price;
        app.redis.setex(rkey, 3600, price);

        return price;
    },

    format_date(date) {
        if (date instanceof String) return (date.length > 10 ? date.substr(0, 10) : date);
        var year = date.getFullYear();
        var month = date.getMonth() + 1;
        var day = date.getDate();
        if (day < 10) day = '0' + day;
        if (month < 10) month = '0' + month;
        return year + '-' + month + '-' + day;
    },

    async get_fixed_price(app, item_id) {
        // Some typeID's have hardcoded prices
        switch (item_id) {
        case 601: // Noob ships, aka corvettes
        case 596:
        case 588:
        case 606:
            return 10000;
        case 12478: // Khumaak
        case 34559: // Conflux Element
            return 0.01; // Items that get market manipulated and abused will go here
        case 44265: // Victory Firework
            return 0.01; // Items that drop from sites will go here
        case 2834: // Utu
        case 3516: // Malice
        case 11375: // Freki
            return 80000000000; // 80b
        case 3518: // Vangel
        case 3514: // Revenant
        case 32788: // Cambion
        case 32790: // Etana
        case 32209: // Mimir
        case 11942: // Silver Magnate
        case 33673: // Whiptail
            return 100000000000; // 100b
        case 35779: // Imp
        case 42125: // Vendetta
        case 42246: // Caedes
            return 120000000000; // 120b
        case 48636: // Hydra
            return 140000000000;
        case 2836: // Adrestia
        case 33675: // Chameleon
        case 35781: // Fiend
        case 45530: // Virtuoso
            return 150000000000; // 150b
        case 33397: // Chremoas
        case 42245: // Rabisu
        case 45649: // Komodo
            return 200000000000; // 200b
        case 45531: // Victor
            return 230000000000;
        case 48635: // Tiamat
            return 250000000000;
        case 9860: // Polaris
        case 11019: // Cockroach
            return 1000000000000; // 1 trillion, rare dev ships
        case 42241: // Molok
            return 350000000000; // 350b
            // Rare cruisers
        case 11940: // Gold Magnate
        case 635: // Opux Luxury Yacht
        case 11011: // Guardian-Vexor
        case 25560: // Opux Dragoon Yacht
        case 33395: // Moracha
            return 500000000000; // 500b
            // Rare battleships
        case 13202: // Megathron Federate Issue
        case 26840: // Raven State Issue
        case 11936: // Apocalypse Imperial Issue
        case 11938: // Armageddon Imperial Issue
        case 26842: // Tempest Tribal Issue
            return 750000000000; // 750b
        }

        // Some groupIDs have hardcoded prices
        item = await app.util.entity.info(app, 'item_id', item_id, true);
        if (item != undefined && item.group_id == 29) return 10000; // Capsules
        if (item != undefined && item.name.indexOf("SKIN") != -1) return 0.01;

        return undefined;
    },

    get_todays_price_key() {
        let nowMinus12 = new Date();
        nowMinus12.setHours(nowMinus12.getHours() - 12);
        return price.format_date(nowMinus12);
    }

}


async function fetch(app, item_id, date, skip_fetch) {
    if (typeof date != 'string') date = app.util.price.format_date(date);
    skip_fetch = skip_fetch || false;

    let epoch = Math.floor(Date.parse(date) / 1000);
    if (epoch > 1259976605) epoch = epoch - (36 * 3600);
    var d = new Date(0);
    d.setUTCSeconds(epoch);
    date = price.format_date(d);

    let key = date + ':' + item_id;
    if (app.cache.prices[key] != undefined) return app.cache.prices[key];

    let marketHistory, count = 0;
    let todays_key = app.util.price.get_todays_price_key();
    do {
        marketHistory = await app.db.prices.findOne({
            item_id: item_id
        });
        if (marketHistory == null) {
            try {
                await app.db.prices.insertOne({
                    item_id: item_id,
                    last_fetched: '',
                    waiting: true
                });
            } catch (e) {}
            marketHistory = {};
        }
        if (marketHistory.last_fetched != todays_key && skip_fetch != true) {
            await app.db.prices.updateOne({
                item_id: item_id,
            }, {
                $set: {
                    waiting: true
                }
            });
            count++;
            if (app.bailout) throw 'Price check bailing';
            //console.log('Waiting on price fetch for: ', item_id);
            await app.sleep(1000);
        }
        if (marketHistory.last_fetched != todays_key && skip_fetch != true) console.log("Price check waiting", item_id, date);
    } while (marketHistory.last_fetched != todays_key && skip_fetch != true);

    let maxSize = 34;
    let useTime = new Date(date);
    let iterations = 0;
    let priceList = [];
    let marketlength = Object.keys(marketHistory).length;
    do {
        useDate = price.format_date(useTime);
        if (marketHistory[useDate] != undefined) {
            priceList.push(marketHistory[useDate]);
        }
        useTime.setDate(useTime.getDate() - 1);
    } while (priceList.length < maxSize && iterations++ < marketlength);

    priceList.sort(numeric_sort);
    if (priceList.length == maxSize) {
        // remove 2 endpoints from each end, helps fight against wild prices from market speculation and scams
        priceList.splice(0, 2); // Remove two lowest prices
        priceList.length = maxSize - 4;
    } else if (priceList.length > 6) {
        priceList.length = (priceList.length - 2); // Remove two highest prices
    } else if (priceList.length == 0) {
        priceList.push(0.01);
    }

    let total = 0;
    for (let i = 0; i < priceList.length; i++) {
        total += priceList[i];
    }
    let avgPrice = Math.round(((total / priceList.length) + Number.EPSILON) * 100) / 100;

    // Don't have a decent price? Let's try to build it!
    if (avgPrice <= 0.01) {
        let buildPrice = await price.get_fixed_price(app, item_id);
        if (buildPrice > 0.01) avgPrice = buildPrice;
    }
    let datePrice = marketHistory[date] >= 0.01 ? marketHistory[date] : 0;
    if (datePrice > 0.01 && datePrice < avgPrice) avgPrice = datePrice;

    app.cache.prices[key] = avgPrice;
    return app.cache.prices[key];
}

async function get_build_price(app, item_id, date) {
    let blueprint = await get_blueprint(app, item_id);

    if (blueprint == undefined || blueprint.reqs == undefined) return 0;
    console.log(blueprint);

    let price = 0;
    for (let i = 0; i < blueprint.reqs.length; i++) {
        let req = blueprint.reqs[i];
        let req_price = await app.util.price.get(app, req.materialTypeID, date);
        let req_total_price = req_price * req.quantity;
        price += req_total_price;
        console.log(req_price + ' ' + req.quantity + ' ' + price);
    }
    let final_price = Math.ceil(0.9 * (price / Math.max(1, blueprint.quantity)));
    return final_price;
}

async function get_blueprint(app, item_id) {
    if (app.cache.blueprints == undefined) {
        let reqs = await import_reqs(app);

        app.cache.blueprints = {};
        console.log('Fetching https://sde.zzeve.com/industryActivityProducts.json');
        let res = await app.phin('https://sde.zzeve.com/industryActivityProducts.json');
        let json = JSON.parse(res.body);
        for (let i = 0; i < json.length; i++) {
            let blueprint = json[i];
            blueprint.reqs = reqs['item_id:' + blueprint.typeID];
            app.cache.blueprints[blueprint.productTypeID] = blueprint;
        }

    }
    return app.cache.blueprints[item_id];
}

async function import_reqs(app) {
    console.log("Importing http://sde.zzeve.com/industryActivityMaterials.json");
    let res = await app.phin('http://sde.zzeve.com/industryActivityMaterials.json');
    let json = JSON.parse(res.body);

    let reqs = [];
    for (let i = 0; i < json.length; i++) {
        let row = json[i];
        if (row.activityID != 1) continue;

        let key = 'item_id:' + row.typeID;
        if (reqs[key] == undefined) reqs[key] = [];
        reqs[key].push(row);
    }
    return reqs;
}

function numeric_sort(a, b) {
    return a - b;
};

module.exports = price;