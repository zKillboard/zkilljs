"use strict";

const port = 18888;

const redis = require("redis").createClient();
const redis2 = require("redis").createClient();
const http = require("http").createServer((req, res) => { res.writeHead(404); res.end(); }).listen(port);
const ws = new (require("websocket").server)({ httpServer: http, autoAcceptConnections: true });

module.export = ws;

console.log(`Websocket: Server started and listening on port ${port}`);
redis.on("pmessage", (pattern, channel, message) => {
	var count = 0;
	ws.connections.forEach( (connection) => {
		var broadcasted = false;
		if (connection.subscriptions instanceof Array) {
			if (broadcasted === false && connection.subscriptions.indexOf(channel) !== -1) {
				connection.send(message);
				count++;
				broadcasted = true;
			}
		}
	});
	//if (count > 0) console.log(`Websocket: Broadcasted to ${count} clients: ${message}`);
	updateWsCount(redis2, ws.connections.length);
});
redis.psubscribe("*");

ws.on('connect', (connection) => {
    // console.log('Websocket: Client connected');
	connection.on('message', function(message) {
		if (message.type === 'utf8') {
			try {
				var data = JSON.parse(message.utf8Data);
				if (connection.subscriptions === undefined) connection.subscriptions = new Array();
				if (data.action === 'sub') {
					var index = connection.subscriptions.indexOf(data.channel);
					if (index == -1) {
						connection.subscriptions.push(data.channel);
					}
				}
				else if (data.action === 'unsub') {
					var index = connection.subscriptions.indexOf(data.channel);
					if (index > -1) {
						connection.subscriptions.splice(index, 1);
					}
				}
			} catch (e) {
			};
		}
	});    
});

function updateWsCount(redis, count) {
	redis.set("zkilljs:websocketCount", count, redis.print);
}
