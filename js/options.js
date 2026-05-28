/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2010-2019 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde
 */

'use strict';

function loadVals() {

    const toneColors = localStorage['tonecolors'] || 'yes';
    if (toneColors === 'no') {
        document.querySelector('#toneColorsNone').checked = true;
    } else {
        const toneColorScheme = localStorage['toneColorScheme'] || 'standard';
        document.querySelector(`input[name="toneColors"][value="${toneColorScheme}"]`).checked = true;
    }

    const simpTrad = localStorage['simpTrad'] || 'classic';
    document.querySelector(`input[name="simpTrad"][value="${simpTrad}"]`).checked = true;

    const zhuyin = localStorage['zhuyin'] || 'no';
    document.querySelector('#zhuyin').checked = zhuyin === 'yes';

    const grammar = localStorage['grammar'] || 'yes';
    document.querySelector('#grammar').checked = grammar !== 'no';

    const vocab = localStorage['vocab'] || 'yes';
    document.querySelector('#vocab').checked = vocab !== 'no';

    const saveToWordList = localStorage['saveToWordList'] || 'allEntries';
    document.querySelector(`input[name="saveToWordList"][value="${saveToWordList}"]`).checked = true;

    const skritterTLD = localStorage['skritterTLD'] || 'com';
    document.querySelector(`input[name="skritterTLD"][value="${skritterTLD}"]`).checked = true;

    const direction = localStorage['direction'] || 'vellum';
    document.querySelector(`input[name="direction"][value="${direction}"]`).checked = true;

    const mode = localStorage['mode'] || 'light';
    document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;

    const density = localStorage['density'] || 'regular';
    document.querySelector(`input[name="density"][value="${density}"]`).checked = true;

    const hanziFont = localStorage['hanziFont'] || 'serif';
    document.querySelector(`input[name="hanziFont"][value="${hanziFont}"]`).checked = true;

    applyThemeToPage();
}

function setToneColorScheme(toneColorScheme) {
    if (toneColorScheme === 'none') {
        setOption('tonecolors', 'no');
    } else {
        setOption('tonecolors', 'yes');
        setOption('toneColorScheme', toneColorScheme);
    }
}

function setOption(option, value) {
    localStorage[option] = value;
    chrome.extension.getBackgroundPage().zhongwenOptions[option] = value;
}

function setBooleanOption(option, value) {
    let yesNo = value ? 'yes' : 'no';
    setOption(option, yesNo);
}

function applyThemeToPage() {
    const html = document.documentElement;
    html.setAttribute('data-direction', localStorage['direction'] || 'vellum');
    html.setAttribute('data-mode', localStorage['mode'] || 'light');
    html.setAttribute('data-density', localStorage['density'] || 'regular');
    html.setAttribute('data-hanzi-font', localStorage['hanziFont'] || 'serif');
}

function setThemeOption(option, value) {
    setOption(option, value);
    applyThemeToPage();
    if (option === 'direction') {
        chrome.runtime.sendMessage({ type: 'updateIcon' });
    }
}

window.addEventListener('load', () => {

    document.querySelectorAll('input[name="toneColors"]').forEach((input) => {
        input.addEventListener('change',
            () => setToneColorScheme(input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="simpTrad"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('simpTrad', input.getAttribute('value')));
    });

    document.querySelector('#zhuyin').addEventListener('change',
        (event) => setBooleanOption('zhuyin', event.target.checked));

    document.querySelector('#grammar').addEventListener('change',
        (event) => setBooleanOption('grammar', event.target.checked));

    document.querySelector('#vocab').addEventListener('change',
        (event) => setBooleanOption('vocab', event.target.checked));

    document.querySelectorAll('input[name="saveToWordList"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('saveToWordList', input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="skritterTLD"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('skritterTLD', input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="direction"]').forEach((input) => {
        input.addEventListener('change',
            () => setThemeOption('direction', input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="mode"]').forEach((input) => {
        input.addEventListener('change',
            () => setThemeOption('mode', input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="density"]').forEach((input) => {
        input.addEventListener('change',
            () => setThemeOption('density', input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="hanziFont"]').forEach((input) => {
        input.addEventListener('change',
            () => setThemeOption('hanziFont', input.getAttribute('value')));
    });

    // AI provider + API keys
    let providerKeyMap = {
        gemini: { storage: 'geminiApiKey', placeholder: 'AIza...' },
        anthropic: { storage: 'anthropicApiKey', placeholder: 'sk-ant-...' },
        openai: { storage: 'openaiApiKey', placeholder: 'sk-...' }
    };

    function loadProviderUI(provider) {
        let info = providerKeyMap[provider] || providerKeyMap.gemini;
        document.getElementById('apiKey').placeholder = info.placeholder;
        document.getElementById('apiKey').value = '';
        document.getElementById('apiKeyStatus').textContent = '';
        chrome.storage.local.get(info.storage, function (result) {
            if (result[info.storage]) {
                document.getElementById('apiKey').value = result[info.storage];
                document.getElementById('apiKeyStatus').textContent = 'Key saved.';
            }
        });
    }

    chrome.storage.local.get('aiProvider', function (result) {
        let provider = result.aiProvider || 'gemini';
        let el = document.querySelector('input[name="aiProvider"][value="' + provider + '"]');
        if (el) el.checked = true;
        loadProviderUI(provider);
    });

    document.querySelectorAll('input[name="aiProvider"]').forEach(function (input) {
        input.addEventListener('change', function () {
            let provider = input.value;
            chrome.storage.local.set({ aiProvider: provider });
            loadProviderUI(provider);
        });
    });

    document.getElementById('saveApiKey').addEventListener('click', function () {
        let provider = document.querySelector('input[name="aiProvider"]:checked');
        if (!provider) return;
        let info = providerKeyMap[provider.value];
        let key = document.getElementById('apiKey').value.trim();
        if (key) {
            let obj = {};
            obj[info.storage] = key;
            chrome.storage.local.set(obj, function () {
                document.getElementById('apiKeyStatus').textContent = 'Key saved.';
            });
        } else {
            chrome.storage.local.remove(info.storage, function () {
                document.getElementById('apiKeyStatus').textContent = 'Key removed.';
            });
        }
    });

});

loadVals();

