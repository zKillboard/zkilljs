'use strict';

var express = require('express');
var path = require('path');
var debug = require('debug')('server');
var http = require('http');
var app = undefined;
var server;

var app = undefined;
async function getApp() {
    if (app === undefined) {
        var req = require('./init.js');
        app = await req();
    }
    return app;
}

startWebListener();

async function startWebListener() {
    var www = express();
    www.app = await getApp();

    www.root = __dirname + "/../";

    www.set('views', path.join(__dirname, '../www/views'));
    www.set('view engine', 'pug');

    www.enable('etag');

    const server_started = Date.now();
    www.use((req, res, next) => {
        res.locals.server_started = server_started;
        res.locals.googleua = process.env.googleua;
        next();
    });

    www.disable('x-powered-by');
    www.use('/api/', require('cors')());

    var indexRouter = require('../www/routes.js');
    www.use('/', indexRouter);

    server = http.createServer(www);
    server.listen((process.env.PORT || '3000'));
    server.on('error', onError);
    server.on('listening', onListening);

    console.log('Listening...');
}

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof port === 'string' ?
        'Pipe ' + port :
        'Port ' + port;
    // handle specific listen errors with friendly messages
    switch (error.code) {
    case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
    case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
    default:
        throw error;
    }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
    var addr = server.address();
    var bind = typeof addr === 'string' ?
        'pipe ' + addr :
        'port ' + addr.port;
    debug('Listening on ' + bind);
}