loadCheck();

// with async js loading, let's make sure umbrella is loaded before we're "document ready"
function loadCheck() {
	if (typeof u != 'function') {
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
}

function apply(element, path) {
	fetch(path).then(response => response.text()).then(html => applyHTML(element, html)).then(() => { console.log('Fetched ' + path); });
}


function applyHTML(element, html) {
	if (typeof element == 'string') element = document.getElementById(element);
	u(element).html(html);
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
 		setTimeout(function() { loadUnfetched(element)}, 100);
 		return;
	}
}