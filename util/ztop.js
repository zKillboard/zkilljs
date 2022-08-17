'use strict';

let ztops = {};

const ztop = {
	zincr: function (app, key, incr = 1) {
        if (ztops[key] == undefined) ztops[key] = incr;
        else ztops[key] = ztops[key] + incr;
    },

    get_ztops: function() {
        try {
            return ztops
        } finally {
            ztops = {}; // observing resets the values
        }
    }
}

module.exports = ztop;