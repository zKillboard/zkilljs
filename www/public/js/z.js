loadCheck();

// with async js loading, let's make sure umbrella is loaded before we're "document ready"
function loadCheck() {
	if (u === undefined) {
		setTimeout(loadCheck, 10);
	} else {
		documentReady();
	}
}

function documentReady() {
}