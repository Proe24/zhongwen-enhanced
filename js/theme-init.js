(function() {
    var h = document.documentElement;
    h.setAttribute('data-direction', localStorage['direction'] || 'vellum');
    h.setAttribute('data-mode', localStorage['mode'] || 'light');
    h.setAttribute('data-density', localStorage['density'] || 'regular');
    h.setAttribute('data-hanzi-font', localStorage['hanziFont'] || 'serif');
})();
