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
	
	// Is the URL not root? Redirect to root


	// Load the nav bar for the current user

	// Load the content based on the URL

	// if a killmail

	// else its an overview page
	var path = window.location.pathname;
	if (path == '/') path = '/site/killmails/all/all.html';
	else path = 'site/' + path;

	apply("content", path);

	$('[data-toggle="tooltip"]').tooltip({trigger: 'click', title: 'data', placement: 'top'});
}

function apply(element, path) {
	fetch(path).then(response => response.text()).then(html => applyHTML(element, html)).then(() => { console.log('Fetched ' + path); });
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

// Iterates any elements with the number class and converts it to an xxx.xx[k,m,t,...] format
function updateNumbers() {
	$.each($('.number'), function(index, element) {
		element = $(element);
		var value = element.text();
		element.text(intToString(value)).removeClass('number');
	});
}

// Converts a number into a smaller quickly readable format
function intToString (value) {
	value = parseInt(value);
	var suffixes = ["", "k", "m", "b", "t", "tt", "ttt"];

	while (value > 999) {
		value = value / 1000;
		suffixes.shift();
	}
	return value.toFixed(2) + suffixes[0];
}