'use strict';

const ztops = {};

const ztop = {
	zincr: function (app, key) {
        app.redis.incr('zkb:ztop:' + key);
    },
}

module.exports = ztop;