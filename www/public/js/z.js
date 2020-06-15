var ws;
var pageActive = Date.now();
var subscribed_channels = [];
var browserHistory = undefined;
var server_started = 0;
var jquery_loaded = false;

function historyReady() {
    try {
        browserHistory = History.createBrowserHistory();
        browserHistory.listen(function (location, action) {
            loadPage();
        });
        console.log('browser history ready and loaded');
    } catch (e) {
        setTimeout(historyReady, 50);
    }
}

function is_jquery_loaded() {
    if (typeof $ == 'function') {
        jquery_loaded = true;
        console.log('jquery loaded');
    } else setTimeout(is_jquery_loaded, 100);
}

// Called at the end of this document since all js libraries are deferred
function documentReady() {
    if (typeof Promise == 'undefined' || typeof fetch == 'undefined') {
        alert("This browser sucks, use a better one.");
        return;
    }

    is_jquery_loaded();
    loadPage();
    ws_connect();

    historyReady();
    toggleTooltips();
    setInterval(pageTimer, 100);
}

function toggleTooltips() {
    try {
        // Prep any tooltips
        $('[data-toggle="tooltip"]').tooltip({
            trigger: 'click',
            title: 'data',
            placement: 'top'
        });
    } catch (e) {
        setTimeout(toggleTooltips, 100);
    }
}

function loadPage() {
    var path = window.location.pathname;
    var fetch;

    window.scrollTo(0, 0);
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
    for (var i = 0; i < contentSection.length; i++) {
        var s = contentSection[i];
        var elem = $("div#" + s);
        if (section != s) elem.hide();
        else elem.show();
    }
}

function loadOverview(path) {
    if (path == '/') path = '/label/all';
    path = path.replace('/system/', '/solar_system/').replace('/type/', '/item/');
    apply('overview-information', '/site/information' + path + '.html');
    apply('overview-statistics', '/site/statistics' + path + '.html', 'statsfeed:' + path);
    apply('overview-killmails', '/site/killmails' + path + '.html', 'killlistfeed:' + path);
    showSection('overview');
    
    /*<div id="overview-information"></div>
        <div id="overview-statistics"></div>
        <div id="overview-menu"></div>
        <div id="overview-killmails"></div>
        <div id="overview-weekly"></div>*/
}

// Prevents the kill list from becoming too large and causing the browser to eat up too much memory
function killlistCleanup() {
    try {
        while ($(".killrow").length > 50) $(".killrow").last().parent().remove();
    } catch (e) {
        setTimeout(killlistCleanup, 100);
    }
}

function apply(element, path, subscribe, delay) {
    if (typeof element == 'string') element = document.getElementById(element);
    // Clear the element
    if (delay != true) element.innerHTML = "";
    if (jquery_loaded) $(element).hide();

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
    element.innerHTML = html;

    loadUnfetched(element);
    killlistCleanup();
    spaTheLinks();
    if (jquery_loaded) $(element).show();
}


function applyJSON(path) {
    fetch(path).then(function (res) {
        handleJSON(res);
    });
}

function handleJSON(res) {
    if (res.ok) {
        res.text().then(function (text) {
            var data = parseJSON(text);
            var keys = Object.keys(data);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var value = data[key];
                var elem = document.getElementById(key);
                if (elem == null) {
                    console.log('could not find ' + key);
                    continue;
                }
                var format = elem.getAttribute('format');
                if (('' + value).length > 0) {
                    switch (format) {
                    case 'integer':
                        value = Number.parseInt(value).toLocaleString();
                        break;
                    case 'fnumber':
                        value = intToString(value);
                        break;
                    }
                }
                if (elem.innerHTML != value) changeValue(elem, value);
            }
        });
    }
}

/* By moving this into a function, the value of value is preserved 
    as the array is being iterated in applyJSON */
function changeValue(elem, value) {
    if (!jquery_loaded) elem.innerHTML = value;
    else $(elem).fadeOut(100, function () {
        $(this).html(value).fadeIn(100);
    });
}

function parseJSON(data) {
    try {
        return JSON.parse(data);
    } catch (e) {
        console.log('Invalid JSON: ', data);
        return {};
    }
}

function loadUnfetched(element) {
    var unfeteched = element.querySelectorAll("[unfetched='true']");
    for (var i = 0; i < unfeteched.length; i++) {
        const tofetch = unfeteched[i];
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
    try {
        $.each($('.fnumber'), function (index, element) {
            element = $(element);
            var value = element.text();
            if (value == "") return;
            element.text(intToString(value))
            element.removeClass('fnumber');
            element.attr('format', 'fnumber');
        });
        $.each($('.integer'), function (index, element) {
            element = $(element);
            var value = element.text();
            if (value == "") return;
            var value = Number.parseInt(value).toLocaleString();
            element.text(value);
            element.removeClass('integer');
            element.attr('format', 'integer');
        });
        $(".decimal").each(function (index, elem) {
            elem = $(elem);
            var value = element.text();
            if (value == "") return;
            var value = Number.parseFloat(value).toLocaleString(undefined, {
                'minimumFractionDigits': 2,
                'maximumFractionDigits': 2
            });
            elem.text(value).removeClass('.decimal').attr('format', 'integer');
        });
    } catch (e) {
        setTimeout(updateNumbers, 100);
    }
}

var suffixes = ["", "k", "m", "b", "t", "q", ];
// Converts a number into a smaller quickly readable format
function intToString(value) {
    value = parseInt(value);
    var index = 0;

    while (value > 999.9999 && index < suffixes.length) {
        value = value / 1000;
        index++;
    }
    return value.toLocaleString(undefined, {
        'minimumFractionDigits': 2,
        'maximumFractionDigits': 2
    }) + suffixes[index];
}

function ws_connect() {
    try {
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
    } catch (e) {
        setTimeout(ws_connect, 100);
    }
}

function ws_clear_subs() {
    if (subscribed_channels.length == 0) return;
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
    case 'statsfeed':
        applyJSON('/site/stats_box' + json.path + ".json");
        break;
    case 'server_started':
        var started = json.server_started;
        if (server_started == 0) server_started = started;
        else if (started != server_started) {
            console.log('reloading');
            location.reload(true);
        }
        break;
    default:
        console.log(json);
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
    try {
        $('.override').removeClass('override').each(spaTheLink);
    } catch (e) {
        setTimeout(spaTheLinks, 100);
    }
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
    var goto = href.replace(window.location.origin, '');
    try {
        browserHistory.push(goto);
    } catch (e) {
        // something didn't load right :/
        window.location = href;
    }
}



// Everything has loaded, let's go!
documentReady();