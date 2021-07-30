var ws;
var pageActive = Date.now();
var subscribed_channels = [];
var browserHistory = undefined;
var server_started = 0;
var jquery_loaded = false;
var path_cache = {};
var path_hash = {};

var timeouts = [];

var type = undefined;
var id = undefined;
var killmail_id = undefined;
var pagepath;

var fetch_controller = new AbortController();

function historyReady() {
    try {
        browserHistory = History.createBrowserHistory();
        browserHistory.listen(function (location, action) {
            loadPage();
        });
        console.log('browser history ready and loaded');
    } catch (e) {
        setTimeout(historyReady, 1);
    }
}

function is_jquery_loaded() {
    if (typeof $ == 'function') {
        jquery_loaded = true;
        console.log('jquery loaded');
    } else setTimeout(is_jquery_loaded, 1);
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
    $(".ofilter").unbind().click(filter_change);
    $("#feedbutton").unbind().click(feed_toggle);
    $("#filtersbutton").unbind().click(filter_toggle);

    historyReady();
    toggleTooltips();

    $('#autocomplete').autocomplete({
        autoSelectFirst: true,
        serviceUrl: '/cache/1hour/autocomplete/',
        dataType: 'json',
        groupBy: 'groupBy',
        onSelect: function (suggestion) {
            var path = '/' + suggestion.data.type + '/' + suggestion.data.id;
            linkClicked(path);
        },
        error: function (xhr) {
            console.log(xhr);
        }
    });
    console.log("Page ready");
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
        timeouts.push(setTimeout(toggleTooltips, 1));
    }
}

function loadPage(url) {
    var path = url == undefined ? window.location.pathname : url;
    var fetch;

    // Clear caches
    path_cache = {};
    path_hash = {};

    // Clear subscriptions
    ws_clear_subs();

    // Clear the JS global cache
    clear_cache();

    // Cancel in flight fetches
    fetch_controller.abort();
    fetch_controller = new AbortController();

    // cancel any timeouts
    while (timeouts.length > 0) {
        clearTimeout(timeouts.shift());
    }

    $("#page-title").html("&nbsp;");
    $(".clearbeforeload").hide();
    $(".hidebeforeload").hide();
    resetFilters();


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
        pagepath = type + '/' + id;
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
    pagepath = path;
    loadKillmails('/site/killmails' + path + '.json', 'killlistfeed:' + path);
    apply('overview-information', '/site/information' + path + '.html');
    apply('overview-weekly', '/site/toptens' + path + '.html', 'toplistsfeed:' + path);
    load_stats_box();
    ws_action('sub', 'statsfeed:' + path);
    showSection('overview');
}

function loadKillmails(url, subscribe) {
    $("#killlist").html($("#spinner").html());
    fetch(url, {
        signal: fetch_controller.signal
    }).then(function (res) {
        if (res.ok) {
            res.text().then(function (text) {
                var data = parseJSON(text);
                if (data.length == 0) {
                    $("#killlist").html("<i>Nothing to see here...</i>");
                } else {
                    $("#killlist").html('');
                    load_killmail_rows(data);
                }
                if (subscribe) ws_action('sub', subscribe);
            });
        }
    });
}

// Prevents the kill list from becoming too large and causing the browser to eat up too much memory
function killlistCleanup() {
    try {
        while ($(".killrow").length > 50) $(".killrow").last().parent().remove();
        applyRedGreen();
    } catch (e) {
        timeouts.push(setTimeout(killlistCleanup, 100));
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
    var fetchpath = path;
    if (path_hash[path]) {
        fetchpath = path + '?current_hash=' + path_hash[path];
    }


    if (typeof element == 'string') element = document.getElementById(element);
    // Clear the element
    if (delay != true) element.innerHTML = "";

    if (path != null) {
        fetch(fetchpath, {
            signal: fetch_controller.signal,
        }).then(function (res) {
            if (res.redirected) {
                var params = getParams(res.url);
                path_hash[path] = params.hash;
            }
            if (res.status == 204) {
                return;
            }
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
    if (path_cache[element.id] == html && element.innerHTML != "") {
        console.log('cache match');
        return;
    }
    path_cache[element.id] = html;
    var child = document.createElement('div');
    child.id = element.id + '-temp';
    child.realid = element.id;
    child.innerHTML = html;
    var loadingzone = document.getElementById('loading-zone');
    //loadingzone.appendChild(child);

    var x = document.documentElement.scrollTop
    element.innerHTML = html;

    $(element).show();
    document.documentElement.scrollTop = x; // prevent screen from scrolling when content is added above current view
    postLoadActions(element);
}


function applyJSON(path) {
    var fetchpath = path;
    if (path_hash[path]) {
        fetchpath = path + '?current_hash=' + path_hash[path];
    }
    fetch(fetchpath, {
        signal: fetch_controller.signal
    }).then(function (res) {
        if (res.redirected) {
            var params = getParams(res.url);
            path_hash[path] = params.hash;
            console.log(res);
        }
        if (res.status == 204) {
            return;
        }
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

                if (key == 'labels') {
                    applyLabelToggles(value);
                    continue;
                }

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
                            'minimumFractionDigits': 1,
                            'maximumFractionDigits': 1
                        }) + '%';
                        break;
                    case 'decimal':
                        value = Number.parseFloat(value).toLocaleString(undefined, {
                            'minimumFractionDigits': 1,
                            'maximumFractionDigits': 1
                        });
                        break;
                    }
                }
                changeValue(elem, value, (format == 'percentage'));
            }
        });
    }
}

var ignored = ['all', 'killed', 'lost', 'pvp', 'npc'];

function applyLabelToggles(labels) {
    $(".ofilter").each(function () {
        var btn = $(this);
        var html = btn.html().toLowerCase();
        if (ignored.indexOf(html) > -1) return;
        //btn.toggle(labels.indexOf(html) > -1);
        if (labels.indexOf(html) > -1) {
            btn.removeAttr("disabled"); // removeClass("btn-light").addClass("btn-secondary").
        } else {
            btn.attr("disabled", "true"); // removeClass("btn-secondary").addClass("btn-light").
        }
    });

}

/* By moving this into a function, the value of value is preserved 
    as the array is being iterated in applyJSON */
function changeValue(elem, value, doRedGreen) {
    elem = $(elem);
    var origvalue = value;
    var rawvalue = elem.attr('raw-value');

    if (rawvalue == origvalue) {
        elem.fadeIn(100);
        return;
    }

    elem.fadeOut(100, function () {
        var elem = $(this);
        elem.html('');
        if (elem.hasClass('progress-bar')) {
            if (value == 'hide') {
                elem.hide(); // just to be sure
                return;
            }
            //if (rawvalue != undefined) return;

            //if (elem.css('width') != (value + '%')) elem.css('width', value + '%').attr('aria-valuenow', value);
            elem.width(value + '%');
            if (value <= 5) value = '';
            else value = value + '%';
        }
        if (doRedGreen) {
            elem.removeClass('green').removeClass('red');
            if (Number.parseInt(value) >= 50) elem.addClass('green');
            else elem.addClass('red');
        }

        elem.html(value).attr('raw-value', origvalue).fadeIn(100);
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
        timeouts.push(setTimeout(function () {
            loadUnfetched(element)
        }, 1));
        return;
    }
    updateNumbers();
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
        $.each($('.decimal'), function (index, element) {
            element = $(element);
            var value = element.text();
            if (value == "") return;
            value = Number.parseFloat(value).toLocaleString(undefined, {
                'minimumFractionDigits': 1,
                'maximumFractionDigits': 1
            });
            element.text(value);
            element.removeClass('decimal');
            element.attr('format', 'decimal');
        });
    } catch (e) {
        timeouts.push(setTimeout(updateNumbers, 100));
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
        ws = new ReconnectingWebSocket('wss://' + window.location.hostname + '/websocket/', '', {
            maxReconnectAttempts: 15
        });
        ws.onmessage = function (event) {
            ws_message(event.data);
        };
        ws.onopen = function (event) {
            console.log('Websocket connected');
            ws_action('sub', 'zkilljs:public');
        }
        ws.onclose = function (event) {
            feed_toggle(null, false);
        }
    } catch (e) {
        timeouts.push(setTimeout(ws_connect, 100));
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
        var feedenabled = $("#feedbutton").hasClass("btn-primary");
        var text = JSON.stringify({
            'action': action,
            'channel': msg
        });

        if (action == 'sub') {
            if (feedenabled || msg == 'zkilljs:public') {
                ws.send(text);
                subscribed_channels.push(msg);
                console.log('ws_action: ', action, msg);
            }
        } else {
            ws.send(text);
            console.log('ws_action: ', action, msg);
        }

    } catch (e) {
        iteration = (iteration || 0) + 1;
        if (iteration > 16) return;
        var wait = 10 * Math.pow(2, iteration);
        timeouts.push(setTimeout(function () {
            ws_action(action, msg, iteration);
        }, wait));
    }
}

function ws_message(msg) {
    if (msg === 'ping' || msg === 'pong') return;
    json = JSON.parse(msg);
    switch (json.action) {
    case 'killlistfeed':
        delayed_json_call(load_killmail_rows, [json.killmail_id]);
        break;
    case 'statsfeed':
        delayed_json_call(load_stats_box, json);
        break;
    case 'toplistsfeed':
        delayed_json_call(load_toplists_box);
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

function load_killmail_rows(killmail_ids) {
    try {
        killmail_ids.sort();
        for (var i = 0; i < killmail_ids.length; i++) {
            var killmail_id = killmail_ids[i];
            // Don't load the same kill twice
            if ($(".kill-" + killmail_id).length > 0) return;

            var url = '/cache/1hour/killmail/row/' + killmail_id + '.html';
            var divraw = '<div fetch="' + url + '" unfetched="true" id="kill-' + killmail_id + '"></div>';
            $("#killlist").prepend(divraw);
        }
        loadUnfetched(document);
    } catch (e) {
        // window.location = window.location;
    }
}

function load_stats_box(json) {
    applyJSON('/cache/1hour/stats_box' + pagepath + '.json');
}

function load_toplists_box(json) {
    console.log('updating top lists');
    apply('overview-weekly', '/site/toptens' + pagepath + '.html', null, true);
}

function spaTheLinks() {
    try {
        $('.override').removeClass('override').each(spaTheLink);
    } catch (e) {
        timeouts.push(setTimeout(spaTheLinks, 100));
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
    if (fwDoc == null) fwDoc = document.getElementById('fittingwheel').firstElementChild;

    if (fwDoc == undefined || fwDoc == null) {
        timeouts.push(setTimeout(setFittingWheel, 1));
    }

    var gslots = fwDoc.getElementsByClassName('slot');
    if (gslots.length != 32) {
        // SVG hasn't fully loaded yet
        timeouts.push(setTimeout(setFittingWheel, 1));
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

function filter_change(eventObject, buttonname) {
    var selected = $(buttonname || this);
    var parent = selected.parent();
    var all_btn_checked = false;
    var other_btn_checked = false;

    var checked = selected.attr('pressed');
    if (checked == undefined) checked = 'no';
    parent.children().each(function () {
        mark_enabled($(this), false);
    })
    mark_enabled(selected, !(checked == 'yes'));

    $(".ofilter").each(function () {
        var btn = $(this);
        if (btn.attr('id') != 'allbtn' && btn.hasClass("btn-primary")) other_btn_checked = true;
    });
    if (selected.attr("id") == 'allbtn') {
        all_btn_checked = true;
        $(".ofilter").each(function () {
            mark_enabled($(this), false);
        });
    } else all_btn_checked = !other_btn_checked;
    mark_enabled($('#allbtn'), all_btn_checked);
    if (!all_btn_checked) {
        feed_toggle(null, false);
    }

    // Now build the filter
    var modifiers = [];
    $(".ofilter").each(function () {
        var btn = $(this);
        if (btn.hasClass("btn-primary") && btn.attr('id') != 'allbtn') {
            modifiers.push(btn.html().toLowerCase());
        }
    });
    modifiers.sort();

    var url = '/site/killmails' + pagepath + '.json';
    if (modifiers.length > 0) url = url + '?modifiers=' + modifiers.join(',');
    //apply('overview-killmails', url, null, true);
    loadKillmails(url);
}

function resetFilters() {
    $(".ofilter").each(function () {
        var btn = $(this);
        mark_enabled(btn, (btn.attr('id') == 'allbtn'));
    });
}

function feed_toggle(event, enabled, doLoad) {
    var feedbutton = $("#feedbutton");
    var isEnabled = feedbutton.hasClass("btn-primary");

    enabled = (enabled == undefined ? !isEnabled : enabled);
    if (doLoad == undefined) doLoad = true && enabled;

    mark_enabled(feedbutton, enabled);
    $("#feedactive").toggle(enabled);
    $("#feedinactive").toggle(!enabled);
    if (enabled && doLoad) {
        resetFilters();
        loadKillmails('/site/killmails' + pagepath + '.json', 'killlistfeed:' + pagepath);
        load_stats_box({
            path: pagepath,
        });
        ws_action('sub', 'statsfeed:' + pagepath);
    } else {
        ws_clear_subs();
    }
}

function filter_toggle() {
    var filterbtn = $("#filtersbutton");
    var enabled = !filterbtn.hasClass("btn-primary");
    $("#overview-filters").toggle(enabled);
    if (enabled) filterbtn.removeClass("btn-secondary").addClass("btn-primary");
    else filterbtn.removeClass("btn-primary").addClass("btn-secondary");
    filterbtn.blur();
    if (!enabled && !$("#allbtn").hasClass("btn-primary")) {
        resetFilters();
        loadKillmails('/site/killmails' + pagepath + '.json', 'killlistfeed:' + pagepath);
        load_stats_box({
            path: pagepath,
        });
    }
}

function mark_enabled(button, checked) {
    if (checked == false) button.removeClass("btn-primary").addClass("btn-secondary").blur();
    else button.removeClass("btn-secondary").addClass("btn-primary").blur();
}

// Everything has loaded, let's go!
documentReady();

function clear_cache() {
    path_cache = {};
}

/**
 * Get the URL parameters
 * source: https://css-tricks.com/snippets/javascript/get-url-variables/
 * @param  {String} url The URL
 * @return {Object}     The URL parameters
 */
var getParams = function (url) {
    var params = {};
    var parser = document.createElement('a');
    parser.href = url;
    var query = parser.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        params[pair[0]] = decodeURIComponent(pair[1]);
    }
    return params;
};

setInterval(clear_cache, 900000);
