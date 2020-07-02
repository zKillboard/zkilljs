var ws;
var pageActive = Date.now();
var subscribed_channels = [];
var browserHistory = undefined;
var server_started = 0;
var jquery_loaded = false;

var timeouts = [];

var type = undefined;
var id = undefined;
var killmail_id = undefined;

const fetch_controller = new AbortController();
const {
    fetch_canceller
} = fetch_controller;

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

    ws_connect();
    is_jquery_loaded();
    loadPage();

    historyReady();
    toggleTooltips();
    setInterval(pageTimer, 100);

    $('#autocomplete').autocomplete({
      autoSelectFirst: true,
      serviceUrl: '/cache/1hour/autocomplete/',
      dataType: 'json',
      groupBy: 'groupBy',
      onSelect: function (suggestion) {
          //window.location = '/' + suggestion.data.type + '/' + suggestion.data.id;
          var path = '/' + suggestion.data.type + '/' + suggestion.data.id;
          linkClicked(path);
      },
      error: function(xhr) { console.log(xhr); }
    });
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

function loadPage(url) {
    var path = url == undefined ? window.location.pathname : url;
    var fetch;

    // Cancel in flight fetches
    fetch_controller.abort();
    $("#page-title").html("&nbsp;");
    $(".clearbeforeload").html("&nbsp;")
    // Clear subscriptions
    ws_clear_subs();
    // cancel any timeouts
    while (timeouts.length > 0) {
        clearTimeout(timeouts.shift());
    }
    window.scrollTo(0, 0);
    $("#autocomplete").val("");

    var split = path.split('/');
    type = (split.length >= 2 ? split[1] : null);
    id = (split.length >= 3 ? split[2] : null);

    switch (type) {
    case "user":
        // TODO
        break;
    case "killmail":
        var killmail_id = id;
        showSection('killmail');
        apply('killmail', '/cache/1hour/killmail/' + killmail_id + '.html');
        break;
    default:
        showSection('overview');
        loadOverview(path, type, id);
        break;
    }
}

const contentSections = ['overview', 'killmail', 'user', 'other'];

function showSection(section) {
    for (var i = 0; i < contentSections.length; i++) {
        var s = contentSections[i];
        var elem = $("div#" + s);
        if (section == s) elem.show();
        else elem.hide();
        elem.removeClass("d-none"); // Just in case the !important is set
    }
}

function loadOverview(path, type, id) {
    if (path == '/') path = '/label/all';
    path = path.replace('/system/', '/solar_system/').replace('/type/', '/item/');
    apply('overview-killmails', '/site/killmails' + path + '.html', 'killlistfeed:' + path);
    apply('overview-information', '/site/information' + path + '.html');
    load_stats_box({
        path: path,
        interval: 15
    });
    ws_action('sub', 'statsfeed:' + path);
    showSection('overview');

    /*<div id="overview-information"></div>
        <div id="overview-statistics"></div>
        <div id="overview-menu"></div>
        <div id="overview-killmails"></div>
        <div id="overview-weekly"></div>*/
}

function loadKillmail(killmail_id) {

}

// Prevents the kill list from becoming too large and causing the browser to eat up too much memory
function killlistCleanup() {
    try {
        while ($(".killrow").length > 50) $(".killrow").last().parent().remove();
        applyRedGreen();
    } catch (e) {
        setTimeout(killlistCleanup, 100);
    }
}

var redgreen_types = ['character', 'corporation', 'alliance', 'faction', 'item', 'group', 'category'];

function applyRedGreen() {
    var path = window.location.pathname;
    var split = path.split('/');
    var type = ((split.length >= 2 && split[1] != undefined) ? split[1] : '');
    if (redgreen_types.indexOf(type) == -1) return;

    if (split.length >= 3 && split[2] != undefined) {
        var id = Number.parseInt(split[2]);
        if (id > 0) {
            var id = '' + (-1 * id);

            $.each($('.killrow'), function (index, element) {
                element = $(element);
                if (element.attr('redgreen_applied') == "true") return;
                var victims = element.attr("victims");
                var victims_array = victims.split(',');
                if (victims_array.indexOf(id) != -1) element.addClass('victimrow').attr('redgreen_applied', 'true');
                else element.addClass('aggressorrow').attr('redgreen_applied', 'true');

            });
        }
    }
}

function apply(element, path, subscribe, delay) {
    if (typeof element == 'string') element = document.getElementById(element);
    // Clear the element
    if (delay != true) element.innerHTML = "";

    if (path != null) {
        fetch(path, {
            fetch_canceller
        }).then(function (res) {
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

    $(element).show();
    postLoadActions(element);
}


function applyJSON(path) {
    fetch(path, {
        fetch_canceller
    }).then(function (res) {
        handleJSON(res);
    });
}

/* Actions to be applied after a page load */
function postLoadActions(element) {
    if (element != undefined) loadUnfetched(element);
    killlistCleanup();
    spaTheLinks();
    $.each($('.page-title'), function (index, element) {
        $("#page-title").html($(element).html());
        $(element).remove();
    });

    $("#load-all-attackers").on('click', function () {
        $("#load-all-attackers").hide();
        $("#remainingattackers").removeClass("d-none");
        apply("remainingattackers", "/cache/1hour/killmail/" + id + "/remaining.html", null, true);
    });

    if ($("#fwraw").length > 0) setFittingWheel();
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
                    case 'percentage':
                        value = Number.parseFloat(value).toLocaleString(undefined, {
                            'minimumFractionDigits': 2,
                            'maximumFractionDigits': 2
                        }) + '%';
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
        $.each($('.isk'), function (index, element) {
            element = $(element);
            var value = element.text();
            if (value == "") return;
            var value = Number.parseInt(value).toLocaleString();
            element.text(value + ' ISK');
            element.removeClass('isk');
            element.attr('format', 'isk');
        });
        $.each($('.percentage'), function (index, element) {
            element = $(element);
            var value = element.text();
            if (value == "") return;
            value = Number.parseFloat(value).toLocaleString(undefined, {
                style: 'percent',
                'minimumFractionDigits': 1,
                'maximumFractionDigits': 1
            });
            element.text(value);
            element.removeClass('percentage');
            element.attr('format', 'percentage');
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
        delayed_json_call(load_killmail_row, json);
        break;
    case 'statsfeed':
        delayed_json_call(load_stats_box, json);
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

function delayed_json_call(f, json) {
    var delay = Math.random(1, 50) * 100; // So not everyone pulls at the same time
    timeouts.push(setTimeout(function () {
        f(json);
    }, delay));
}

function load_killmail_row(json) {
    var killmail_id = json.killmail_id;
    // Don't load the same kill twice
    if ($(".kill-" + killmail_id).length > 0) return;

    var url = '/cache/1hour/killmail/row/' + killmail_id + '.html';
    var divraw = '<div fetch="' + url + '" unfetched="true" id="kill-' + killmail_id + '"></div>';
    $("#killlist").prepend(divraw);
    loadUnfetched(document);
}

function load_stats_box(json) {
    if (json.path == undefined) {
        throw 'path is not defined';
    }
    json.interval = json.interval || 15;
    var now = Math.floor(Date.now() / 1000);
    var param = '?epoch=' + (now - (now % json.interval));

    applyJSON('/cache/1hour/stats_box' + json.path + '.json' + param);
    //applyJSON('/cache/1hour/stats_box' + json.path + '.json' + param);
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

function setFittingWheel() {
    if ($("#fwraw").length == 0) return;
    var fitting = JSON.parse($("#fwraw").text());
    var ship_id = $("#fwship").text();
    var fwDoc = document.getElementById('fittingwheel').contentDocument;

    var gslots = fwDoc.getElementsByClassName('slot');
    if (gslots.length != 32) {
        // SVG hasn't fully loaded yet
        setTimeout(setFittingWheel, 1);
        return;
    }
    var ship = fwDoc.getElementById('victimship');

    setSvgAttribute(ship, 'href', 'https://images.evetech.net/types/' + ship_id + '/render?size=512', true);

    for (var i = 0; i < gslots.length; i++) {
        var elem = gslots[i];
        //setSvgAttribute(elem, 'style', 'display: none;');
    }

    for (var i = 0; i < fitting.length; i++) {
        var item = fitting[i];
        applyToFittingSlot(fwDoc, item);
    }
    $("#fwraw").remove();
}

function applyToFittingSlot(fwDoc, item) {
    try {
        var slotflagid = 'flag' + item.flag;
        var slotflag = fwDoc.getElementsByClassName(slotflagid);
        if (slotflag.length < 1) return;
        slotflag = slotflag[0];

        removeSvgAttribute(slotflag, 'style', 'display: none;');
        var image = slotflag.getElementsByClassName(item.base)[0].getElementsByTagName('image')[0];

        setSvgAttribute(image, 'alt', item.item_type_name, true);
        setSvgAttribute(image, 'role', 'img', true);
        setSvgAttribute(image, 'class', 'image', true);
        setSvgAttribute(image, 'href', 'https://images.evetech.net/types/' + item.item_type_id + '/icon?size=64', true);

        var newElement = document.createElementNS("http://www.w3.org/2000/svg", 'title'); //Create a path in SVG's namespace
        newElement.textContent = item.item_type_name;
        image.appendChild(newElement);
    } catch (e) {
        console.log(e);
        console.log(item);
    }
}

function setSvgAttribute(element, attr_name, attr_value, overwrite) {
    var current_value = element.getAttribute(attr_name);
    if (current_value == null || overwrite == true) current_value = '';
    element.setAttribute(attr_name, attr_value + current_value);
}

function removeSvgAttribute(element, attr_name, attr_value) {
    var current_value = element.getAttribute(attr_name);
    if (current_value == null) current_value = '';
    element.setAttribute(attr_name, current_value.replace(attr_value, ''));
}

// Everything has loaded, let's go!
documentReady();
