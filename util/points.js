'use strict';

const one_point_groups = [29, 31, 237];

module.exports = {
    get: async function (app, rawmail) {
        if (rawmail.victim == undefined || rawmail.victim.ship_type_id == undefined) return 1;

        const victim = rawmail.victim;
        let ship_type_id = victim.ship_type_id;
        const items = victim.items || {};
        const ship = await app.util.entity.info(app, 'item_id', ship_type_id);

        if (one_point_groups.indexOf(ship.group_id) != -1) return 1;

        let shipInfo = {};
        shipInfo.rigSize = await app.util.info.getDogma(app, ship_type_id, 1547);

        let dangerFactor = 0;
        let basePoints = Math.pow(5, shipInfo.rigSize);
        let points = basePoints;
        for (let i = 0; i < victim.items.length; i++) {
            let item = victim.items[i];
            let itemInfo = await app.util.entity.info(app, 'item_id', item.item_type_id);
            let groupInfo = itemInfo.group_id != undefined ? await app.util.entity.info(app, 'group_id', itemInfo.group_id) : [];
            if (groupInfo.category_id != 7) continue;

            let flagName = await app.util.info.getFlagName(app, item.flag);
            if ((flagName == "Low Slots" || flagName == "Mid Slots" || flagName == "High Slots" || flagName == 'SubSystems') || (rawmail.killmail_id < 23970577 && item.flag == 0)) {
                let item_id = item.item_type_id;
                let qty = (item.quantity_destroyed || 0) + (item.quantity_dropped || 0);
                let metaLevel = await app.util.info.getDogma(app, item_id, 633);
                let meta = 1 + Math.floor(metaLevel / 2);
                let heatDamage = await app.util.info.getDogma(app, item_id, 1211);
                dangerFactor += (heatDamage > 0 ? 1 : 0) * qty * meta; // offensive/defensive modules overloading are good for pvp
                dangerFactor += (itemInfo.group_id == 645 ? 1 : 0) * qty * meta; // drone damange multipliers
                dangerFactor -= (itemInfo.group_id == 54 ? 1 : 0) * qty * meta; // Mining ships don't earn as many points
            }
        }
        points += dangerFactor;
        points *= Math.max(0.01, Math.min(1, dangerFactor / 4));

        // Divide by number of ships on rawmail
        let numAttackers = rawmail.attackers.length;
        let involvedPenalty = Math.max(1, numAttackers * Math.max(1, numAttackers / 2));
        points = points / involvedPenalty;

        // Apply a bonus/penalty from -50% to 20% depending on average size of attacking ships
        // For example: Smaller ships blowing up bigger ships get a bonus
        // or bigger ships blowing up smaller ships get a penalty
        let size = 0;
        let hasChar = false;
        for (let i = 0; i < rawmail.attackers.length; i++) {
            let attacker = rawmail.attackers[i];
            hasChar |= attacker.character_id || 0 > 0;
            ship_type_id = attacker.ship_type_id || 0;
            shipInfo = await app.util.entity.info(app, 'item_id', ship_type_id) || {};
            if (shipInfo.group_id == undefined) return 1;
            let groupInfo = await app.util.entity.info(app, 'group_id', (shipInfo.group_id != undefined ? shipInfo.group_id : 29));
            let categoryID = groupInfo.category_id || 0;
            if (categoryID == 65) return 1; // Structure on your mail, only 1 point

            let rigSize = await app.util.info.getDogma(app, ship_type_id, 1547) || 0;
            size += Math.pow(5, ((shipInfo.group_id != 29) ? rigSize : rigSize + 1));
        }
        if (hasChar == false) return 1;
        let avg = Math.max(1, size / numAttackers);
        let modifier = Math.min(1.2, Math.max(0.5, basePoints / avg));

        points = Math.floor(points * modifier);

        return Math.max(1, points);
    }
}