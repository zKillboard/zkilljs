var ws
var pageActive = Date.now();
const subscribed_channels = [];
const browserHistory = History.createBrowserHistory();
var server_started = 0;

// Called at the end of this document since all js libraries are deferred
function documentReady() {
    // Prep any tooltips
    $('[data-toggle="tooltip"]').tooltip({
        trigger: 'click',
        title: 'data',
        placement: 'top'
    });

    loadPage();

    ws_connect();
    setInterval(pageTimer, 1000);
}

function loadPage() {
    var path = window.location.pathname;
    var fetch;

    $(window).scrollTop(0);
    ws_clear_subs();

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
}

const contentSection = ['overview', 'killmail', 'user', 'other'];

function showSection(section) {
    for (var s of contentSection) {
        var elem = $("div#" + s);
        if (section != s) elem.hide();
        else elem.show();
    }
}

function loadOverview(path) {
    if (path == '/') {
        apply('overview-information', null);
        apply('overview-statistics', null);
        apply('overview-killmails', '/site/killmails/all/all.html', 'killlistfeed:all');
    } else {
        path = path.replace('/system/', '/solar_system/').replace('/type/', '/item/');
        apply('overview-information', '/site/information' + path + '.html');
        apply('overview-statistics', '/site/statistics' + path + '.html');
        apply('overview-killmails', '/site/killmails' + path + '.html', 'killlistfeed:' + path);
    }
    showSection('overview');
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

function apply(element, path, subscribe) {
    if (typeof element == 'string') element = document.getElementById(element);
    // Clear the element
    $(element).html("");

    if (path != null) {
        fetch(path).then(function (res) {
            handleResponse(res, element, path, subscribe);
        });
    }
}

function handleResponse(res, element, path, subscribe) {

    if (res.ok) {
        res.text().then(function (html) {
            applyHTML(element, html);
            if (subscribe) ws_action('sub', subscribe);
        });
    }
}

function applyHTML(element, html) {
    if (typeof element == 'string') element = document.getElementById(element);
    $(element).html(html);
    loadUnfetched(element);
    killlistCleanup();
    spaTheLinks();
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
    $(".fnumber").each(function (index, elem) {
        elem = $(elem);
        var value = Number.parseFloat(elem.html()).toLocaleString();
        elem.removeClass('fnumber').html(value);
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
        ws_message(event.data);
    };
    ws.onopen = function (event) {
        console.log('Websocket connected');
        ws_action('sub', 'zkilljs:public');
    }
}

function ws_clear_subs() {
    console.log('Clearing subscriptions');
    while (subscribed_channels.length > 0) {
        var channel = subscribed_channels.shift();
        
        if (channel != 'zkilljs:public') {
            console.log('clearing', channel);
            text = JSON.stringify({
                'action': 'unsub',
                'channel': channel
            });
            ws.send(text);
        }
    }
    console.log(subscribed_channels);
}

// Send an action through the websocket
function ws_action(action, msg, iteration) {
    try {
        var text = JSON.stringify({
            'action': action,
            'channel': msg
        });
        ws.send(text);
        if (action == 'sub') {
            subscribed_channels.push(msg);
        }
        console.log('ws_action: ', action, msg);
    } catch (e) {
        iteration = (iteration || 0) + 1;
        if (iteration > 16) return;
        var wait = 10 * Math.pow(2, iteration);
        setTimeout(function () {
            ws_action(action, msg, iteration);
        }, wait);
    }
}

function ws_message(msg) {
    if (msg === 'ping' || msg === 'pong') return;
    json = JSON.parse(msg);
    switch (json.action) {
    case 'killlistfeed':
        var killmail_id = json.killmail_id;
        // Don't load the same kill twice
        if ($(".kill-" + killmail_id).length > 0) return;

        var url = '/site/killmail/row/' + killmail_id + '.html';
        var divraw = '<div fetch="' + url + '" unfetched="true" id="kill-' + killmail_id + '"></div>';
        $("#killlist").prepend(divraw);
        loadUnfetched(document);
        break;
    case 'server_started':
        var started = json.server_started;
        if (server_started == 0) server_started = started;
        else if (started != server_started) {
            console.log('reloading');
            location.reload(true);
        }
        break;
    }
}

function pageTimer() {
    let now = Date.now();
    let delta = now - pageActive;
    if (delta > 300000) {
        location.reload(true);
    }
    pageActive = now;
}

function spaTheLinks() {
    $('.override').removeClass('override').each(spaTheLink);
}

function spaTheLink(index, elem) {
    elem = $(elem);

    elem.on('click', function (e) {
        e.preventDefault();
        linkClicked(this.href);

        return false;
    });
}

function linkClicked(href) {
    href = href.replace(window.location.origin, '');
    browserHistory.push(href);
}

browserHistory.listen((location, action) => {
    loadPage();
});

// Everything has loaded, let's go!
documentReady();