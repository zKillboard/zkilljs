'use strict';

module.exports = {
   paths: '/cache/1hour/autocomplete/',
   get: get,
   ttl: 3600
}

async function get(req, res) {
    let valid = req.verify_query_params(req, {
        query: 'string'
    });
    if (valid !== true) return {redirect: valid};

    const app = req.app.app;

    const filter = req.query.query;
    let allresults = [];

    for (const type of types) {
    	allresults = allresults.concat(await search(app, type, filter, false));
    }
    return {
        json: {'suggestions': allresults },
    };

}

async function search(app, type, name, ticker) {
    try {
        let secondSort = (type == 'character' ? ' ' : ', memberCount desc ');
        let column = (ticker ? ' ticker ' : ' name');
        let query = 'select type, id, name from autocomplete where type = ? and (name = ? or name like ?) order by name limit 15';
        let result = await app.mysql.query(query, [type, name, name + '%']);

        let visual_type = type.replace('_id', '');
        let groupby = visual_type.replace('_', ' ') + 's';

        let ret = [];
        for (let i = 0; i < result.length; i++) {
            const row = result[i];
            let add = {
                value: row.name,
                data: {
                    'type': visual_type,
                    groupBy: groupby,
                    id: row.id
                }
            };
            ret.push(add);
        }
        return ret;
    } catch (e) {
        console.log(e);
        return [];
    }
}

const types = [
    'region_id',
    'solar_system_id',
    'item_id',
    'group_id',
    'faction_id',
    'alliance_id',
    'corporation_id',
    'character_id',
    'category_id',
    'location_id',
    'constellation_id',
]; // war_id is excluded
