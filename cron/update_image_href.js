'use strict';

module.exports = f;

const imageServer = 'https://images.evetech.net/';

async function f(app) {
    let information = await app.db.information.find();
    while (await information.hasNext()) {
        const row = await information.next();


        switch (row.type) {
        case 'character_id':
            await update(app, row, imageServer + 'characters/:id/portrait?size=');
            break;

        case 'corporation_id':
        	if (row.id == 1000288 || row.id == 1000274) await update(app, row, imageServer + 'alliances/1/logo?size=');
            else await update(app, row, imageServer + 'corporations/:id/logo?size=');
            break;

        case 'alliance_id':
            await update(app, row, imageServer + 'alliances/:id/logo?size=');
            break;

        case 'item_id':
            if (row.category_id == 9) {
                // Blueprint
                await update(app, row, imageServer + 'types/:id/bp?size=');
            } else {
                await update(app, row, imageServer + 'types/:id/icon?size=');
            }
            break;
        case 'faction_id':
            await update(app, row, imageServer + 'alliances/1/logo?size=');
            break;
        case 'solar_system_id':
            var type = await app.util.entity.info(app, 'star_id', row.star_id);
            if (type != null) await update(app, row, imageServer + 'types/' + type.type_id + '/render?size=');
            break;

        case 'group_id':
        case 'category_id':
        case 'constellation_id':
        case 'region_id':
        case 'location_id':
        case 'war_id':

            break; // ignore these

        default:
            console.log(row.type, row.id);
            console.log('unknown type ' + row.type);
            process.exit();
        }
    }
    process.exit();

}

async function update(app, row, href) {
    href = href.replace(':id', row.id);
    if (row.imageHref !== href) {
        app.db.information.updateOne({
            _id: row._id
        }, {
            $set: {
                image_href: href
            }
        });
    }
}