'use strict';

let ztops = {};

/*function showztops() {
    console.log(ztops);
    ztops = {};
}
setInterval(showztops, 5000);*/

const ztop = {
	zincr: function (app, key) {
        if (ztops[key] == undefined) ztops[key] = 1;
        else ztops[key] = ztops[key] + 1;
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