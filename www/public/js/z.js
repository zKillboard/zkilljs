loadCheck();

// with async js loading, let's make sure umbrella is loaded before we're "document ready"
function loadCheck() {
	if (typeof $ != 'function') {
		setTimeout(loadCheck, 1);
	} else {
		documentReady();
	}
}

function documentReady() {
	// Prep any tooltips
	$('[data-toggle="tooltip"]').tooltip({trigger: 'click', title: 'data', placement: 'top'});

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
}

function loadOverview(path) {
	if (path == '/') {
		apply('overview-information', null);
		apply('overview-killmails', '/site/killmails/all/all.html');
	} else {
		path = path.replace('/system/', '/solar_system/').replace('/type/', '/item/');
		apply('overview-information', '/site/information' + path + '.html');
		apply('overview-killmails', '/site/killmails' + path + '.html');
	}
	                /*<div id="overview-information"></div>
                <div id="overview-statistics"></div>
                <div id="overview-menu"></div>
                <div id="overview-killmails"></div>
                <div id="overview-weekly"></div>*/
}

function apply(element, path) {
	if (typeof element == 'string') element = document.getElementById(element);
	// Clear the element
	$(element).html("");

	if (path != null) {
		// Load the content into the element
		fetch(path).then(response => response.text()).then(html => applyHTML(element, html)).then(() => { console.log('Fetched ' + path); });
	}
}


function applyHTML(element, html) {
	if (typeof element == 'string') element = document.getElementById(element);
	$(element).html(html);
	loadUnfetched(element);
}

function loadUnfetched(element) {
	var unfeteched = element.querySelectorAll(`[unfetched='true']`);
	for (const tofetch of unfeteched) {
		const path = tofetch.getAttribute('fetch');
		const id = tofetch.getAttribute('id');
  		tofetch.removeAttribute('unfetched');
  		tofetch.removeAttribute('fetch');
  		apply(id, path);
 		setTimeout(function() { loadUnfetched(element)}, 1);
 		return;
	}
	setTimeout(updateNumbers, 1);
}

// Iterates any elements with the number class and calls intToString to convert it
function updateNumbers() { 
	$.each($('.number'), function(index, element) {
		element = $(element);
		var value = element.text();
		element.text(intToString(value)).removeClass('number');
	});
}

var suffixes = ["", "k", "m", "b", "t", "tt", "ttt"];
// Converts a number into a smaller quickly readable format
function intToString (value) {
	value = parseInt(value);
	var index = 0;	

	while (value > 999.9999) {
		value = value / 1000;
		index++;
	}
	return value.toLocaleString(undefined,  {'minimumFractionDigits': 2,'maximumFractionDigits': 2}) + suffixes[index];
}