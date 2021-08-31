'use strict';

async function getData(req, res) {
     const app = req.app.app;

     let retset = [];

     let current_ops = await app.db.eval("return db.currentOp()");
     for (const op of current_ops.inprog) { 
        if ( (op.secs_running || 0) < 1 ) continue;
        var row = {elapsed: op.secs_running, query: op.command };
        retset.push(row);
     }

    return {
        json: retset
    };
}

module.exports = getData;