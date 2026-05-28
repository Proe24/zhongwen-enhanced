/*
 Apply theme attributes from chrome.storage.local as early as possible.
 Hide the document until the theme is applied to avoid a flash.
 */

(function () {
    var h = document.documentElement;
    h.style.visibility = 'hidden';
    function reveal() { h.style.visibility = ''; }

    function apply(s) {
        h.setAttribute('data-direction', s.direction || 'vellum');
        h.setAttribute('data-mode', s.mode || 'light');
        h.setAttribute('data-density', s.density || 'regular');
        h.setAttribute('data-hanzi-font', s.hanziFont || 'serif');
        reveal();
    }

    if (typeof zhongwenStorage !== 'undefined') {
        zhongwenStorage.get(['direction', 'mode', 'density', 'hanziFont']).then(apply);
    } else if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['direction', 'mode', 'density', 'hanziFont'], apply);
    } else {
        reveal();
    }

    // Safety net: never leave the page hidden longer than 500ms.
    setTimeout(reveal, 500);
})();
