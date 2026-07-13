/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2010-2019 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde
 */

'use strict';

function errorMessage(error) {
    return error && error.message ? error.message : String(error);
}

function showOptionsError(error) {
    let status = document.getElementById('optionsStatus');
    if (!status) return;
    status.textContent = 'Could not save settings: ' + errorMessage(error);
    status.hidden = false;
}

function clearOptionsError() {
    let status = document.getElementById('optionsStatus');
    if (!status) return;
    status.textContent = '';
    status.hidden = true;
}

async function runOptionUpdate(update, restore) {
    clearOptionsError();
    try {
        await update();
        return true;
    } catch (error) {
        try {
            await (restore || loadVals)();
        } catch (restoreError) {
            console.error('Could not reload persisted settings:', restoreError);
        }
        showOptionsError(error);
        return false;
    }
}

async function loadVals() {
    let s = await zhongwenStorage.get();

    if (s.tonecolors === 'no') {
        document.querySelector('#toneColorsNone').checked = true;
    } else {
        document.querySelector(`input[name="toneColors"][value="${s.toneColorScheme}"]`).checked = true;
    }

    document.querySelector(`input[name="simpTrad"][value="${s.simpTrad}"]`).checked = true;
    document.querySelector('#zhuyin').checked = s.zhuyin === 'yes';
    document.querySelector('#grammar').checked = s.grammar !== 'no';
    document.querySelector('#vocab').checked = s.vocab !== 'no';
    document.querySelector(`input[name="saveToWordList"][value="${s.saveToWordList}"]`).checked = true;
    document.querySelector(`input[name="skritterTLD"][value="${s.skritterTLD}"]`).checked = true;
    document.querySelector(`input[name="direction"][value="${s.direction}"]`).checked = true;
    document.querySelector(`input[name="mode"][value="${s.mode}"]`).checked = true;
    document.querySelector(`input[name="density"][value="${s.density}"]`).checked = true;
    document.querySelector(`input[name="hanziFont"][value="${s.hanziFont}"]`).checked = true;
    document.querySelector(`input[name="defView"][value="${s.defView}"]`).checked = true;

    let slider = document.getElementById('popupScale');
    if (slider) {
        slider.value = s.popupScale;
        applyPopupScalePreview(s.popupScale);
        applyPopupPreviewTheme(s);
    }

    applyThemeToPage(s);
}

function applyPopupScalePreview(scale) {
    let preview = document.getElementById('popupPreview');
    let label = document.getElementById('popupScaleValue');
    if (preview) preview.style.zoom = scale;
    if (label) label.textContent = Math.round(parseFloat(scale) * 100) + '%';
}

function applyPopupPreviewTheme(s) {
    let preview = document.getElementById('popupPreview');
    if (!preview) return;
    preview.setAttribute('data-direction', s.direction || 'vellum');
    preview.setAttribute('data-mode', s.mode || 'light');
    preview.setAttribute('data-density', s.density || 'regular');
    preview.setAttribute('data-hanzi-font', s.hanziFont || 'serif');
    if (s.tonecolors === 'no') {
        preview.setAttribute('data-tone-scheme', 'none');
    } else if (s.toneColorScheme && s.toneColorScheme !== 'signature') {
        preview.setAttribute('data-tone-scheme', s.toneColorScheme);
    } else {
        preview.removeAttribute('data-tone-scheme');
    }
}

async function setToneColorScheme(toneColorScheme) {
    if (toneColorScheme === 'none') {
        await zhongwenStorage.setRaw({ tonecolors: 'no' });
    } else {
        await zhongwenStorage.setRaw({ tonecolors: 'yes', toneColorScheme: toneColorScheme });
    }
    let s = await zhongwenStorage.get(['direction', 'mode', 'density', 'hanziFont', 'tonecolors', 'toneColorScheme']);
    applyPopupPreviewTheme(s);
}

async function setOption(option, value) {
    await zhongwenStorage.set(option, value);
}

function setBooleanOption(option, value) {
    return setOption(option, value ? 'yes' : 'no');
}

function applyThemeToPage(s) {
    const html = document.documentElement;
    html.setAttribute('data-direction', s.direction);
    html.setAttribute('data-mode', s.mode);
    html.setAttribute('data-density', s.density);
    html.setAttribute('data-hanzi-font', s.hanziFont);
}

async function setThemeOption(option, value) {
    await setOption(option, value);
    let s = await zhongwenStorage.get(['direction', 'mode', 'density', 'hanziFont', 'tonecolors', 'toneColorScheme']);
    applyThemeToPage(s);
    applyPopupPreviewTheme(s);
    if (option === 'direction') {
        chrome.runtime.sendMessage({ type: 'updateIcon' });
    }
}

window.addEventListener('load', () => {

    document.querySelectorAll('input[name="toneColors"]').forEach((input) => {
        input.addEventListener('change',
            () => runOptionUpdate(() => setToneColorScheme(input.getAttribute('value'))));
    });

    document.querySelectorAll('input[name="simpTrad"]').forEach((input) => {
        input.addEventListener('change',
            () => runOptionUpdate(() => setOption('simpTrad', input.getAttribute('value'))));
    });

    document.querySelector('#zhuyin').addEventListener('change',
        (event) => runOptionUpdate(() => setBooleanOption('zhuyin', event.target.checked)));

    document.querySelector('#grammar').addEventListener('change',
        (event) => runOptionUpdate(() => setBooleanOption('grammar', event.target.checked)));

    document.querySelector('#vocab').addEventListener('change',
        (event) => runOptionUpdate(() => setBooleanOption('vocab', event.target.checked)));

    document.querySelectorAll('input[name="saveToWordList"]').forEach((input) => {
        input.addEventListener('change',
            () => runOptionUpdate(() => setOption('saveToWordList', input.getAttribute('value'))));
    });

    document.querySelectorAll('input[name="skritterTLD"]').forEach((input) => {
        input.addEventListener('change',
            () => runOptionUpdate(() => setOption('skritterTLD', input.getAttribute('value'))));
    });

    document.querySelectorAll('input[name="direction"]').forEach((input) => {
        input.addEventListener('change',
            () => runOptionUpdate(() => setThemeOption('direction', input.getAttribute('value'))));
    });

    document.querySelectorAll('input[name="mode"]').forEach((input) => {
        input.addEventListener('change',
            () => runOptionUpdate(() => setThemeOption('mode', input.getAttribute('value'))));
    });

    document.querySelectorAll('input[name="density"]').forEach((input) => {
        input.addEventListener('change',
            () => runOptionUpdate(() => setThemeOption('density', input.getAttribute('value'))));
    });

    document.querySelectorAll('input[name="hanziFont"]').forEach((input) => {
        input.addEventListener('change',
            () => runOptionUpdate(() => setThemeOption('hanziFont', input.getAttribute('value'))));
    });

    document.querySelectorAll('input[name="defView"]').forEach((input) => {
        input.addEventListener('change',
            () => runOptionUpdate(() => setOption('defView', input.getAttribute('value'))));
    });

    let scaleSlider = document.getElementById('popupScale');
    let scaleReset = document.getElementById('popupScaleReset');
    if (scaleSlider) {
        scaleSlider.addEventListener('input', () => applyPopupScalePreview(scaleSlider.value));
        scaleSlider.addEventListener('change',
            () => runOptionUpdate(() => setOption('popupScale', scaleSlider.value)));
    }
    if (scaleReset) {
        scaleReset.addEventListener('click', () => {
            scaleSlider.value = '1';
            applyPopupScalePreview('1');
            return runOptionUpdate(() => setOption('popupScale', '1'));
        });
    }

    // AI provider + API keys
    let providerKeyMap = {
        gemini: { storage: 'geminiApiKey', placeholder: 'AIza...' },
        anthropic: { storage: 'anthropicApiKey', placeholder: 'sk-ant-...' },
        openai: { storage: 'openaiApiKey', placeholder: 'sk-...' }
    };

    async function loadProviderUI(provider, showSavedStatus) {
        let info = providerKeyMap[provider] || providerKeyMap.gemini;
        document.getElementById('apiKey').placeholder = info.placeholder;
        document.getElementById('apiKey').value = '';
        document.getElementById('apiKeyStatus').textContent = '';
        let result = await zhongwenStorage.getRaw(info.storage);
        if (result[info.storage]) {
            document.getElementById('apiKey').value = result[info.storage];
            if (showSavedStatus !== false) {
                document.getElementById('apiKeyStatus').textContent = 'Key saved.';
            }
        }
    }

    async function loadProviderSelection() {
        let result = await zhongwenStorage.getRaw('aiProvider');
        let provider = result.aiProvider || 'gemini';
        document.querySelectorAll('input[name="aiProvider"]').forEach(input => {
            input.checked = input.value === provider;
        });
        await loadProviderUI(provider);
    }

    loadProviderSelection().catch(error => showOptionsError(error));

    document.querySelectorAll('input[name="aiProvider"]').forEach(function (input) {
        input.addEventListener('change', function () {
            let provider = input.value;
            return runOptionUpdate(async () => {
                await zhongwenStorage.setRaw({ aiProvider: provider });
                await loadProviderUI(provider);
            }, loadProviderSelection);
        });
    });

    document.getElementById('saveApiKey').addEventListener('click', async function () {
        let provider = document.querySelector('input[name="aiProvider"]:checked');
        if (!provider) return;
        let info = providerKeyMap[provider.value];
        let key = document.getElementById('apiKey').value.trim();
        let status = document.getElementById('apiKeyStatus');
        status.textContent = '';
        try {
            if (key) {
                let obj = {};
                obj[info.storage] = key;
                await zhongwenStorage.setRaw(obj);
                document.getElementById('apiKeyStatus').textContent = 'Key saved.';
            } else {
                await zhongwenStorage.removeRaw(info.storage);
                document.getElementById('apiKeyStatus').textContent = 'Key removed.';
            }
        } catch (error) {
            try {
                await loadProviderUI(provider.value, false);
            } catch (restoreError) {
                console.error('Could not reload persisted API key:', restoreError);
            }
            status.textContent = 'Could not save key: ' + errorMessage(error);
        }
    });

});

loadVals().catch(error => showOptionsError(error));
