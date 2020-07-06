'use strict';

async function f(req, res) {
    var valid = req.verify_query_params(req, {
        query: 'string'
    });
    if (valid !== true) return valid;

    const app = req.app.app;

    const filter = req.query.query;
    var allresults = [];

    for (var type of types) {
    	allresults = allresults.concat(await search(app, type, filter, false));
    }
    return {json: {'suggestions': allresults }};

}

async function search(app, type, name, ticker) {
    try {
        let secondSort = (type == 'character' ? ' ' : ', memberCount desc ');
        let column = (ticker ? ' ticker ' : ' name');
        let query = 'select type, id, name from autocomplete where type = ? and (name = ? or name like ?) order by name limit 15';
        let result = await app.mysql.query(query, [type, name, name + '%']);

        let visual_type = type.replace('_id', '');
        let groupby = visual_type.replace('_', ' ') + 's';

        let ret = [], row;
        for (let i = 0; i < result.length; i++) {
            row = result[i];
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

function addResults(allresults, result, ids) {
    var row;
    for (let i = 0; i < result.length; i++) {
        if (ids.indexOf(row.id) != -1) continue;
        ids.push(row.id);

        row = result[i];
        let add = {
            value: row.name,
            data: {
                'type': type,
                groupBy: type + 's',
                id: row.id
            }
        };
        allresults.push(add);
    }
}

var types = [
    'character_id',
    'corporation_id',
    'alliance_id',
    'faction_id',
    'item_id',
    'group_id',
    'category_id',
    'location_id',
    'solar_system_id',
    'constellation_id',
    'region_id',
]; // war_id is excluded

module.exports = f;