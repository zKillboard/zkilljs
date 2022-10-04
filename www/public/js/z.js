var ws;
var pageActive = Date.now();
var subscribed_channels = [];
var browserHistory = undefined;
var path_cache = {};
var path_hash = {};
var first_pageview = true;

var timeouts = [];

var type = undefined;
var id = undefined;
var killmail_id = undefined;
var pagepath;

function noop() {}

var page_reloaded = false;
function detectBackForward() {
    if (window.performance && window.performance.navigation.type === window.performance.navigation.TYPE_BACK_FORWARD) {
        if (page_reloaded == false) {
            page_reloaded = true;
            reloadPage();
        }
    }
}
setInterval(detectBackForward, 5000);

var fetch_controllers = [];

var connected_online = window.navigator.onLine;
function connection_status_update() {
    if (connected_online == false && window.navigator.onLine == true) reloadPage();
    connected_online = window.navigator.onLine;

    if (connected_online == false) {
        ws.close();
    }
}

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

// Called at the end of this document since all js libraries are deferred
function documentReady() {
    /*detectAdblock().then((res) => {
        if (res.uBlockOrigin === true || res.adblockPlus === true) {
            console.log(res);
            /*message = '<center>adblockers break how this site works - please disable them</center>';
            document.documentElement.innerHTML = message;
        } 
    });*/
    prepPage();
}

function prepPage() {
    page_reloaded = false;
    if (typeof Promise == 'undefined' || typeof fetch == 'undefined') {
        alert("This browser sucks, use a better one.");
        return;
    }

    $("#feedbutton").unbind().on('click', toggle_feed);
    $("#reset_filters").on('click', toggle_feed);

    $(".filter").on('click', filter_clicked);
    $(".tfilter").on('click', tfilter_clicked);
    
    $("#more_filters_button").on('click', blur);
    $("#more_filters_button button").on('click', handle_extra_filters);

    $('.pagefilter').on('click', filter_pagenum);

    window.addEventListener('online', connection_status_update);
    window.addEventListener('offline', connection_status_update);

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

    ws_connect();
    loadPage();

    historyReady();
    toggleTooltips();

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

let load_ztop = false;
let ztop_timeout = -1;
function toggleZTop() {
    load_ztop = !load_ztop;
    if (load_ztop == true) {
        console.log('loading ztop');
        $("#ztop").html('Loading ztop...');
        loadZTop();
    } else {
        clearTimeout(ztop_timeout);
        console.log('clearing ztop');
        $("#ztop").html("");
    }
    return false;
}

function loadZTop() {
    if (load_ztop) {
        apply("ztop", "/site/ztop.txt", null, true);
        clearTimeout(ztop_timeout);
        ztop_timeout = setTimeout(loadZTop, 5000);
    }
}

function loadPage(url) {
    var path = url == undefined ? window.location.pathname : url;
    if (path == '/server/ztop') {
        load_ztop = false; // will toggle to true on the next call
        showSection('other');
        toggleZTop();
        return;
    }
    var fetch;

    // Clear caches
    path_cache = {};
    path_hash = {};

    // Clear subscriptions
    ws_clear_subs();

    // Clear the JS global cache
    clear_cache();

    abort_fetches();

    // cancel any timeouts
    while (timeouts.length > 0) {
        clearTimeout(timeouts.shift());
    }

    $("#page-title").remove();
    $(".clearbeforeload").hide();
    $(".hidebeforeload").hide();
    
    window.scrollTo(0, 0);
    $("#autocomplete").val("");

    var split = path.split('/');
    let current_type = type;
    type = (split.length >= 2 ? split[1] : null);
    id = (split.length >= 3 ? split[2] : null);

    if (current_type != type) {
        $("#killmail").html('');
        $("#killlist").html('');
        $("#overview-toptens").html('');
    }

    switch (type) {
    case "user":
        // TODO
        break;
    case "kill":
        var killmail_id = id;
        showSection('killmail');
        apply('killmail', '/cache/1hour/killmail/' + killmail_id + '.html?v=' + server_started);
        break;
    default:
        reset_filters();
        showSection('overview');
        pagepath = type + '/' + id;
        loadOverview(path, type, id);
        break;
    }
    if (!first_pageview) gtag('pageview'); // to prevent double pageview on page loads
    first_pageview = false;
}

function get_fetch_controller() {
    var fetch_controller = new AbortController();
    fetch_controllers.push(fetch_controller);
    return fetch_controller;
}

function abort_fetches() {
    for (let i = 0; i < fetch_controllers.length; i++) fetch_controllers[i].abort();
    fetch_controllers.length = 0;
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
    if (path == '/') path = '/label/pvp';
    path = path.replace('/system/', '/solar_system/').replace('/type/', '/item/');
    pagepath = path;

    filter_change();
    load_stats_box();
    apply('overview-information', '/site/information' + path + '.html', false, true);
    
    ws_action('sub', 'statsfeed:' + path);
    
    showSection('overview');
    handle_extra_filters();
}

function catchErrorHandler(e) {
    if (e.code == 20) return; // fetch was aborted on purpose
    console.log(e);
}

function load_killmails(url, subscribe) {
    $("#killlist").css('opacity', 0.25);
    fetch(url, {
        signal: get_fetch_controller().signal
    }).then(function (res) {
        if (res.ok) {
            if (res.abort) return;
            res.text().then(function (text) {
                $("#killlist").css('opacity', 1);
                var data = parseJSON(text);
                if (data.length == 0) {
                    $("#killlist").html($("#noactivity").html());
                } else {
                    $("#killlist").html('');
                    load_killmail_rows(data);
                }
                if (subscribe) ws_action('sub', subscribe);
            });
        }
    }).catch(catchErrorHandler);
}

// Prevents the kill list from becoming too large and causing the browser to eat up too much memory
function killlist_cleanup() {
    try {
        while ($(".killrow").length > 50) $(".killrow").last().parent().remove();
        applyRedGreen();
    } catch (e) {
        timeouts.push(setTimeout(killlist_cleanup, 100));
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
    if (delay != true) $(element).css('opacity', 0.25); // element.innerHTML = "";
    
    if (path != null) {
        let controller = get_fetch_controller();
        fetch(fetchpath, {
            signal: controller.signal
        }).then(function (res) {
            if (res.redirected) {
                var params = getParams(res.url);
                path_hash[path] = params.hash;
            }
            if (res.status == 204) {
                return;
            }
            handleResponse(res, element, path, subscribe);
        }).catch(catchErrorHandler);
        return controller;
    }
}

function handleResponse(res, element, path, subscribe) {
    if (res.ok) {
        res.text().then(function (html) {
            applyHTML(element, html);
            if (subscribe) ws_action('sub', subscribe);
        }).catch(catchErrorHandler);
    }
}

function applyHTML(element, html) {
    if (typeof element == 'string') element = document.getElementById(element);
    if (path_cache[element.id] == html && element.innerHTML != "") {
        console.log('cache match');
        return;
    }
    let jquery_element = $(element);
    try {
        if (jquery_element.html() == html) return; // nothing to update.... 

        // path_cache[element.id] = html;
        var child = document.createElement('div');
        child.id = element.id + '-temp';
        child.realid = element.id;
        child.innerHTML = html;
        // var loadingzone = document.getElementById('loading-zone');

        var x = document.documentElement.scrollTop
        element.innerHTML = html;

        jquery_element.show();
        document.documentElement.scrollTop = x; // prevent screen from scrolling when content is added above current view
        postLoadActions(element);
    } finally {
        jquery_element.css('opacity', 1);
    }
}


function applyJSON(path) {
    var fetchpath = path;
    if (path_hash[path]) {
        fetchpath = path + '?current_hash=' + path_hash[path];
    }
    fetch(fetchpath, {
        signal: get_fetch_controller().signal
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
    }).catch(catchErrorHandler);
}

/* Actions to be applied after a page load */
function postLoadActions(element) {
    if (element != undefined) loadUnfetched(element);
    killlist_cleanup();
    spaTheLinks();
    var title = $("#page-title").text();
    title = (title.length > 0) ? title + ' - zKillboard' : 'zKillboard';
    $(document).prop('title',  title);

    $("#load-all-attackers").on('click', function () {
        $("#load-all-attackers").hide();
        $("#remainingattackers").removeClass("d-none");
        apply("remainingattackers", "/cache/1hour/killmail/" + id + "/remaining.html", null, true);
    });

    if ($("#fwraw").length > 0) setFittingWheel();
    adjustDateHeaders();
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
    return;
    $(".ofilter").each(function () {
        var btn = $(this);
        var html = btn.html().toLowerCase();
        if (ignored.indexOf(html) > -1) return;

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
    }
    updateNumbers();
    $(".sort-trigger").on('click', sortColumn);
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
        ws = new ReconnectingWebSocket(websocket_url, '', {
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
            ws_interrupted = true;
            toggle_feed(null, false);
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
            console.log('ws_action: ', 'unsub', channel);
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
            if ((feedenabled || msg == 'zkilljs:public') && subscribed_channels.indexOf(msg) == -1) {
                ws.send(text);
                subscribed_channels.push(msg);
                console.log('ws_action: ', action, msg);
                console.log(subscribed_channels)
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
        case 'server_status':
            var started = json.server_started;
            if (server_started == 0) server_started = started;
            else if (started != server_started) {
                console.log(started, server_started);
                setTimeout(reloadPage, 1000 + Math.random(500, 2000)); 
            }
            $("#mails_parsed").text(Number.parseInt(json.mails_parsed || 0).toLocaleString());
            break;
        default:
            console.log(json);
    }
}

function reloadPage() {
    location.reload(true);
}

function delayed_json_call(f, json) {
    var delay = Math.random(1, 50) * 100; // So not everyone pulls at the same time
    timeouts.push(setTimeout(function () {
        f(json);
    }, delay));
}

function load_killmail_rows(killmail_ids) {
    try {
        for (var i = 0; i < killmail_ids.length; i++) {
            var killmail_id = killmail_ids[i];

            // Don't load the same kill twice
            if ($(".kill-" + killmail_id).length > 0) return;

            var url = '/cache/1hour/killmail/row/' + killmail_id + '.html?v=' + server_started;
            var divraw = '<div fetch="' + url + '" unfetched="true" id="kill-' + killmail_id + '" class="killlist-killmail"></div>';
            let killlist_killmails = $(".killlist-killmail");
            if (killlist_killmails.length == 0) $("#killlist").prepend(divraw); // add it at top top of the list
            else { // find the correct spot in the list to add the killmail
                let inserted = false;
                killlist_killmails.each(function(i, row) {
                    if (inserted) return;
                    try {
                        row = $(row);
                        let that_kill_id = parseInt(row.attr('id').replace('kill-', ''));
                        if (killmail_id == that_kill_id) {
                            // remove the current entry, maybe it was re-processed?
                            row.remove();
                            return; // insert it before the next killmail
                        }
                        if (killmail_id > that_kill_id) {
                            row.before(divraw);
                            inserted = true;
                            return;
                        }
                    } catch (e) { console.log(e);}
                });
                if (inserted == false && killlist_killmails.length < 50) $("#killlist").append(divraw);  // add it to the end of the list
            }            
        }
        loadUnfetched(document);
    } catch (e) {
        // reloadPage();
    }
}

function load_stats_box(json) {
    applyJSON('/cache/1hour/stats_box' + pagepath + '.json');
}

function filter_pagenum(elem) {
    elem = $(this);
    $(".pagefilter").each(function() {
        $(this).removeClass('btn-primary').removeClass('btn-secondary').addClass('btn-secondary');
    });
    elem.removeClass('btn-secondary').addClass('btn-primary').blur();

    toggle_feed(null, false);
    load_killmails_section();
}

function load_killmails_section(modifiers = null) {
    if (pagepath == undefined) return;

    if (modifiers == null) modifiers = build_modifiers();

    let params = [];
    if (modifiers.length) params.push('modifiers=' + modifiers.join(','));
    params.push('type=' + type);
    params.push('id=' + (type == 'label' ? 0 : id));
    params.push('v=' + server_started);
    params.push('page=' + $(".pagefilter.btn-primary").text());

    let url = '/site/killmails.json?' + params.sort().join('&');

    load_killmails(url, 'killlistfeed:' + pagepath);
}

let current_top_list_request = null;
function load_toplists_box(modifiers = null) {
    if (current_top_list_request != null) current_top_list_request.abort();
    if (pagepath == undefined) return;

    if (modifiers == null) modifiers = build_modifiers();
    modifiers.push($(".tfilter.btn-primary").attr('value'));

    let params = [];
    if (modifiers.length) params.push("modifiers=" + modifiers.join(','));
    params.push('type=' + type);
    params.push('id=' + (type == 'label' ? 0 : id));
    params.push('v=' + server_started);

    $("#overview-toptens").css('opacity', 0.25);

    current_top_list_request = apply('overview-toptens', '/site/toptens.html?' + params.sort().join('&'), 'toplistsfeed:' + pagepath, true, true);
}

function spaTheLinks() {
    try {
        $('.override').removeClass('override').each(spaTheLink);
        prefetchPrep();
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

function prefetchPrep() {
    $(".prefetch").removeClass('prefetch').each(prefetchSetup);
}

function prefetchSetup() {
    elem = $(this);
    elem.on('mouseover', prefetchGo);
}

function prefetchGo() {
    elem = $(this);
    let href = '/cache/1hour' + elem.attr('href') + '.html';
    $.get(href);
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

function build_modifiers() {
    var modifiers = [];
    $(".filter.btn-primary").each(function () {
        var btn = $(this);
        var value = btn.attr('value');
        if (value == undefined) value = btn.html().toLowerCase();
        modifiers.push(value);
    });

    if ($("#filter-kills").hasClass("btn-primary") && $("#filter-losses").hasClass("btn-primary")) noop();
    else if ($("#filter-kills").hasClass("btn-primary")) modifiers.push('killed');
    else if ($("#filter-losses").hasClass("btn-primary")) modifiers.push('lost');
    else noop();

    if (type == 'label' && id != 'all') modifiers.push(id);

    modifiers.sort();
    return modifiers;
}

function blur(e, elem) {
    var elem = (elem != undefined ? $(elem) : $(this));
    elem.blur();
}

function get_filter_value(elem) {
    var value = elem.attr('value');
    if (value == null || value == undefined || value == '') value = elem.html();
    return value;
}

function filter_clicked() {
    abort_fetches();

    var elem = $(this);
    elem.blur();
    var value = get_filter_value(elem);

    var radio_group = elem.attr('radio');
    var enabling = elem.hasClass('btn-secondary');

    $(".filter").each(function() {
        var filter = $(this);
        if (filter.attr('radio') != radio_group) return;
        filter.removeClass('btn-primary').removeClass('btn-secondary').addClass('btn-secondary');
    });

    if (enabling) elem.removeClass('btn-secondary').addClass('btn-primary');

    // Make sure one of the time spans is clicked, if necessary, enable the week span for defaults
    if ($(".tfilter.btn-primary").length == 0) {
        $("#stats-epoch-week").removeClass('btn-secondary').addClass('btn-primary');
    }

    filter_change();
}

function tfilter_clicked() {
    var elem = $(this);
    elem.blur();

    $(".tfilter").each(function() {
        $(this).removeClass('btn-primary').removeClass('btn-secondary').addClass('btn-secondary');
    });
    elem.removeClass('btn-secondary').addClass('btn-primary');
    $("#overview-toptens").css('opacity', 0.25);
    load_toplists_box();
}

function filter_change() {
    abort_fetches();
    var modifiers = build_modifiers();

    if (pagepath == undefined) return;

    if ($(".filter.btn-primary").not("#stats-epoch-week").length > 0) {
        $("#reset_filters").removeClass("btn-secondary").addClass("btn-primary").removeAttr("disabled");
        toggle_feed(null, false);
    }
    else {
        $("#reset_filters").removeClass("btn-primary").addClass("btn-secondary").attr("disabled", "disabled");
    }

    handle_extra_filters();
        
    load_toplists_box(modifiers);
    load_killmails_section(modifiers);
}

function reset_filters(event) {
    console.log('resetting filters');
    $(".filter").removeClass("btn-primary").addClass('btn-secondary');
    $("#stats-epoch-week").removeClass("btn-secondary").addClass("btn-primary");
    $("#reset_filters").blur();

    $(".pagefilter").each(function() {
        let elem = $(this);
        elem.removeClass('btn-primary').removeClass('btn-secondary').addClass('btn-secondary');
        if (elem.text() == '1') elem.removeClass('btn-primary').removeClass('btn-secondary').addClass('btn-primary');
    });

    $(".tfilter").each(function() {
        let elem = $(this);
        elem.removeClass('btn-primary').removeClass('btn-secondary').addClass('btn-secondary');
        if (elem.text() == '7') elem.removeClass('btn-primary').removeClass('btn-secondary').addClass('btn-primary');
    });

    filter_change();
}

function toggle_feed(event, new_state) {
    var feedbutton = $("#feedbutton");
    let current_state = feedbutton.hasClass('btn-primary');
    if (!(new_state === true || new_state === false)) new_state = !current_state;

    if (current_state == new_state) return; // do nothing

    feedbutton.removeClass('btn-primary').removeClass('btn-secondary').addClass((new_state ? 'btn-primary': 'btn-secondary')).blur();

    console.log('Live feed is', (new_state ? 'enabled' : 'disabled'));

    if (new_state) {
        loadPage();
    } else {
        ws_clear_subs();
    }
}

function toggle_button(object, user_action = true) {
    var btn = $(object);
    if (btn.hasClass('btn-primary')) btn.removeClass('btn-primary').addClass('btn-secondary');
    else btn.removeClass('btn-secondary').addClass('btn-primary');
    btn.blur();

    if (user_action) filter_change();
}

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

var sortColumns = [0, ' ', 'Qty', 'Value'];
function sortColumn(eventObject) {
    var index = sortColumns.indexOf($(this).text());
    if (index == -1) index = 1;
    let cargotable = $("#cargotable");

    if (cargotable.attr('prepped') != 'true') {
        let rows = $('#cargotable tr');

        for (i = 0; i < rows.length; i++) {
            let row = rows[i];
            let td1 = $(row).find('td:eq(1)');
            let td2 = $(row).find('td:eq(2)');
            let td3 = $(row).find('td:eq(3)');

            td1.attr('col-value', (i == 0 ? Number.MAX_VALUE : rows.length - i));
            if (i == 0) td2.attr('col-value', (i == 0 ? Number.MAX_VALUE : rows.length - i));
            if (i == 0) td3.attr('col-value', (i == 0 ? Number.MAX_VALUE : rows.length - i));
            if (i == 0 || td3.attr('col-value') == undefined) $(row).addClass('no-sort-row');
        }
        cargotable.attr('prepped', 'true');
    }

    const table = $('#cargotable');
    const rows = $('#cargotable tbody tr');

    // Sort the rows based on the index selected
    rows.sort( function(x, y) {
        let valuex = (x.cells[index] ? x.cells[index].getAttribute('col-value') : -1);
        let valuey = (y.cells[index] ? y.cells[index].getAttribute('col-value') : -1);
        return valuey - valuex;
    } );

    // and after sorting, rearrange the table
    for (let i = 0; i < rows.length; i++) {
        $("#cargotable tr:eq(" + i + ")").after(rows[i]);
    }

    if (index != 1) {
        $("#sort-reset").show();
        $(".item-group").show();
        $(".group-name").hide();
        $('.no-sort-row').hide();
        $('.group-toggle').hide();
    } else {
        $("#sort-reset").hide();
        $(".item-group").show();
        $(".group-name").show()
        $('.no-sort-row').show();
    }
    $('#master-sort-row').show();

    $(".sort-trigger").blur();
}

function apply_aria_toggle() {
    var elem = $(this);
    var aria_expanded = $(elem).attr('aria-expanded');
    if (aria_expanded == "false") elem.removeClass('btn-secondary').addClass('btn-primary');
    else elem.removeClass('btn-primary').addClass('btn-secondary');
    elem.blur();
}

function handle_extra_filters() {
    var selected = $("#morefilters .btn-primary").not("#stats-epoch-week");
    if (selected.length > 0) $("#more_filters_button").attr("disabled", "disabled");
    else $("#more_filters_button").removeAttr("disabled");

    if ($("#more_filters").hasClass("showing") || $("#more_filters").hasClass("show")) $("#more_filters_button").removeClass("btn-secondary").addClass("btn-primary");
    else $("#more_filters_button").removeClass("btn-primary").addClass("btn-secondary");
}

function setSelectedStatsEpoch() {
    $(".stats-epoch").removeClass("btn-primary").addClass("btn-secondary");
    $(this).removeClass("btn-secondary").addClass("btn-primary").blur();
    load_toplists_box();
}

function setSelectedStatsKL() {
    $(".stats-killed-lost").removeClass("btn-primary").addClass("btn-secondary");
    $(this).removeClass("btn-secondary").addClass("btn-primary").blur();
    load_toplists_box();
}

function adjustDateHeaders() {
    let shown = [];
    $(".killmaildate").each(function() {
        let elem = $(this);
        let date = elem.text();
        if (shown.indexOf(date) == -1) {
            elem.removeClass('d-none');
            shown.push(date);
        } else {
            if (!elem.hasClass('d-none')) elem.addClass('d-none');
        }
    });
}

// Everything has loaded, let's go!
setTimeout(documentReady, 1);