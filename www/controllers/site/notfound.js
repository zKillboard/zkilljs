'use strict';

module.exports = {
   paths: ['*'],
   get: get,
   priority: 2
}

async function get(req, res) {
   return {redirect: './../'};
}