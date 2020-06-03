var ws;
const subscribed_channels = [];
loadCheck();

// loop while async js loading
function loadCheck() {
    if (typeof $ != 'function') {
        setTimeout(loadCheck, 1);
    } else {
        documentReady();
    }
}

function documentReady() {
    // Prep any tooltips
    $('[data-toggle="tooltip"]').tooltip({
        trigger: 'click',
        title: 'data',
        placement: 'top'
    });

    var path = window.location.pathname;
    var fetch;

    // if a user page...
    if (path.substring(0, 6) == '/user/') {
        console.log('user page');
    }
    // if a killmail
    else if (window.location.pathname.substring(0, 10) == '/killmail/') {
        fetch = '/site' + path;
        console.log('killmail! ' + fetch);
    } else { // overview page
        loadOverview(path);
    }

    ws_connect();
}

function loadOverview(path) {
    ws_clear_subs();
    if (path == '/') {
        apply('overview-information', null);
        apply('overview-statistics', null);
        apply('overview-killmails', '/site/killmails/all/all.html');
        ws_action('sub', 'killlistfeed:all', true);
    } else {
        path = path.replace('/system/', '/solar_system/').replace('/type/', '/item/');
        apply('overview-information', '/site/information' + path + '.html');
        apply('overview-statistics', '/site/statistics' + path + '.html');
        apply('overview-killmails', '/site/killmails' + path + '.html');
        ws_action('sub', 'killlistfeed:' + path, true);
    }
    /*<div id="overview-information"></div>
    	<div id="overview-statistics"></div>
    	<div id="overview-menu"></div>
    	<div id="overview-killmails"></div>
    	<div id="overview-weekly"></div>*/
}

// Prevents the kill list from becoming too large and causing the browser to eat up too much memory
function killlistCleanup() {
    while ($(".killrow").length > 50) $(".killrow").last().parent().remove();
}

function apply(element, path) {
    if (typeof element == 'string') element = document.getElementById(element);
    // Clear the element
    $(element).html("");

    if (path != null) {
        fetch(path).then(function(res) { handleResponse(res, element, path); });
    }
}

function handleResponse(res, element, path) {

	if (res.ok) {
		res.text().then(function(html) { applyHTML(element, html); });
	}
}

function applyHTML(element, html) {
    if (typeof element == 'string') element = document.getElementById(element);
    $(element).html(html);
    loadUnfetched(element);
    killlistCleanup();
}

function loadUnfetched(element) {
    var unfeteched = element.querySelectorAll(`[unfetched='true']`);
    for (const tofetch of unfeteched) {
        const path = tofetch.getAttribute('fetch');
        const id = tofetch.getAttribute('id');
        tofetch.removeAttribute('unfetched');
        tofetch.removeAttribute('fetch');
        apply(id, path);
        setTimeout(function () {
            loadUnfetched(element)
        }, 1);
        return;
    }
    setTimeout(updateNumbers, 1);
}

// Iterates any elements with the number class and calls intToString to convert it
function updateNumbers() {
    $.each($('.number'), function (index, element) {
        element = $(element);
        var value = element.text();
        element.text(intToString(value)).removeClass('number');
    });
}

var suffixes = ["", "k", "m", "b", "t", "tt", "ttt"];
// Converts a number into a smaller quickly readable format
function intToString(value) {
    value = parseInt(value);
    var index = 0;

    while (value > 999.9999) {
        value = value / 1000;
        index++;
    }
    return value.toLocaleString(undefined, {
        'minimumFractionDigits': 2,
        'maximumFractionDigits': 2
    }) + suffixes[index];
}

function ws_connect() {
    ws = new ReconnectingWebSocket('wss://zkillboard.com:2096/', '', {
        maxReconnectAttempts: 15
    });
    ws.onmessage = function (event) {
        ws_log(event.data);
    };
    ws.onopen = function (event) {
        console.log('Websocket connected');
    }
}

function ws_clear_subs() {
    while (subscribed_channels.length > 0) {
        text = JSON.stringify({
            'action': 'unsub',
            'channel': subscribed_channels.shift()
        });
        ws.send(text);
    }
}

// Send an action through the websocket
function ws_action(action, msg, iteration) {
    try {
        var text = JSON.stringify({
            'action': action,
            'channel': msg
        });
        ws.send(text);
        if (action == 'sub') subscribed_channels.push(msg);
    } catch (e) {
        iteration = (iteration || 0) + 1;
        if (iteration > 16) return;
        var wait = 10 * Math.pow(2, iteration);
        setTimeout(function () {
            ws_action(action, msg, iteration);
        }, wait);
    }
}

function ws_log(msg) {
    if (msg === 'ping' || msg === 'pong') return;
    json = JSON.parse(msg);
    if (json.action == 'killlistfeed') {
        var killmail_id = json.killmail_id;
        // Don't load the same kill twice
        if ($(".kill-" + killmail_id).length > 0) return;

        var url = '/site/killmail/row/' + killmail_id + '.html';
        var divraw = '<div fetch="' + url + '" unfetched="true" id="kill-' + killmail_id + '"></div>';
        $("#killlist").prepend(divraw);
        loadUnfetched(document);
    }
}