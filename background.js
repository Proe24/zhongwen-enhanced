/*
 Zhongwen Enhanced - A Chinese-English Pop-Up Dictionary
 Modified 2026 by Stephen Underwood: added AI sentence breakdown
 (Anthropic / Gemini / OpenAI), vocab lists, Anki/Pleco export, and
 Manifest V3 migration. See NOTICE.md for the full list of changes.

 Based on Zhongwen
 Copyright (C) 2010-2019 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde

 ---

 Originally based on Rikaikun 0.8
 Copyright (C) 2010 Erek Speed
 http://code.google.com/p/rikaikun/

 ---

 Originally based on Rikaichan 1.07
 by Jonathan Zarate
 http://www.polarcloud.com/

 ---

 Originally based on RikaiXUL 0.4 by Todd Rudick
 http://www.rikai.com/
 http://rikaixul.mozdev.org/

 ---

 This program is free software; you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation; either version 2 of the License, or
 (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program; if not, write to the Free Software
 Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA

 ---

 Please do not change or remove any of the copyrights or links to web pages
 when modifying any of the files.

 */

'use strict';

import { ZhongwenDictionary } from './dict.js';

const OPTION_KEYS = [
    'tonecolors', 'skritterTLD', 'zhuyin', 'grammar', 'vocab', 'simpTrad',
    'toneColorScheme', 'direction', 'mode', 'density', 'hanziFont', 'popupScale'
];
const OPTION_DEFAULTS = {
    tonecolors: 'yes', skritterTLD: 'com', zhuyin: 'no', grammar: 'yes',
    vocab: 'yes', simpTrad: 'classic', toneColorScheme: 'standard',
    direction: 'vellum', mode: 'light', density: 'regular', hanziFont: 'serif',
    popupScale: '1'
};

let isActivated = false;
let tabIDs = {};
let dict;
let thesaurus;        // word -> [synonyms], lazily loaded from data/thesaurus.json
let thesaurusLoading; // in-flight load promise, so concurrent lookups share one fetch

function getStorage(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function setStorage(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

async function getOptions() {
    let result = await getStorage(OPTION_KEYS);
    let out = {};
    OPTION_KEYS.forEach(k => { out[k] = result[k] !== undefined ? result[k] : OPTION_DEFAULTS[k]; });
    return out;
}

async function activateExtension(tabId, showHelp) {
    isActivated = true;
    await setStorage({ enabled: '1' });

    if (!dict) {
        loadDictionary().then(r => dict = r);
    }

    let options = await getOptions();

    try {
        await chrome.tabs.sendMessage(tabId, { type: 'enable', config: options });
    } catch (e) { /* tab may not have content script (chrome:// etc.) */ }

    if (showHelp) {
        try {
            await chrome.tabs.sendMessage(tabId, { type: 'showHelp' });
        } catch (e) {}
    }

    chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
    chrome.action.setBadgeText({ text: 'On' });

    await rebuildContextMenus();
    await updateIcon();
}

async function rebuildContextMenus() {
    await new Promise(resolve => chrome.contextMenus.removeAll(resolve));
    chrome.contextMenus.create({ id: 'open-wordlist', title: 'Open word list', contexts: ['all'] });
    chrome.contextMenus.create({ id: 'show-help', title: 'Show help in new tab', contexts: ['all'] });
    chrome.contextMenus.create({
        id: 'breakdown-selection',
        title: 'Zhongwen: Break down sentence',
        contexts: ['selection']
    });
}

async function updateIcon() {
    let { direction = 'vellum' } = await getStorage('direction');
    let accents = { vellum: '#8a3324', slate: '#1c4670', crimson: '#b3271f' };
    let textColors = { vellum: '#fbf4df', slate: '#ffffff', crimson: '#fbf6e3' };
    let radii = { vellum: 4, slate: 2, crimson: 1 };
    let accent = accents[direction];
    let textColor = textColors[direction];
    let baseRad = radii[direction];
    let imageData = {};

    [16, 48].forEach(function (size) {
        let canvas = new OffscreenCanvas(size, size);
        let ctx = canvas.getContext('2d');
        let r = Math.round(baseRad * size / 48);

        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(size - r, 0);
        ctx.quadraticCurveTo(size, 0, size, r);
        ctx.lineTo(size, size - r);
        ctx.quadraticCurveTo(size, size, size - r, size);
        ctx.lineTo(r, size);
        ctx.quadraticCurveTo(0, size, 0, size - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.fillStyle = accent;
        ctx.fill();

        ctx.fillStyle = textColor;
        ctx.font = 'bold ' + Math.round(size * 0.6) + 'px "Noto Serif SC", "SimSun", "Songti SC", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('中', size / 2, size / 2 + Math.round(size * 0.04));

        imageData[String(size)] = ctx.getImageData(0, 0, size, size);
    });

    chrome.action.setIcon({ imageData: imageData });
}

async function loadDictData() {
    let wordDict = fetch(chrome.runtime.getURL("data/cedict_ts.u8")).then(r => r.text());
    let wordIndex = fetch(chrome.runtime.getURL("data/cedict.idx")).then(r => r.text());
    let grammarKeywords = fetch(chrome.runtime.getURL("data/grammarKeywordsMin.json")).then(r => r.json());
    let vocabKeywords = fetch(chrome.runtime.getURL("data/vocabularyKeywordsMin.json")).then(r => r.json());
    return Promise.all([wordDict, wordIndex, grammarKeywords, vocabKeywords]);
}

async function loadDictionary() {
    let [wordDict, wordIndex, grammarKeywords, vocabKeywords] = await loadDictData();
    return new ZhongwenDictionary(wordDict, wordIndex, grammarKeywords, vocabKeywords);
}

// Lazily load the offline thesaurus (Chinese Open Wordnet, CC BY 3.0).
function loadThesaurus() {
    if (thesaurus) return Promise.resolve(thesaurus);
    if (!thesaurusLoading) {
        thesaurusLoading = fetch(chrome.runtime.getURL('data/thesaurus.json'))
            .then(r => r.json())
            .then(data => { thesaurus = data; return thesaurus; })
            .catch(() => { thesaurusLoading = null; return {}; });
    }
    return thesaurusLoading;
}

// Look up synonyms, preferring the simplified form then the traditional form.
async function findSynonyms(simplified, traditional) {
    let t = await loadThesaurus();
    let syns = (simplified && t[simplified]) || (traditional && t[traditional]) || [];
    return syns;
}

async function deactivateExtension() {
    isActivated = false;
    await setStorage({ enabled: '0' });
    dict = undefined;

    chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] });
    chrome.action.setBadgeText({ text: '' });

    chrome.windows.getAll({ populate: true }, function (windows) {
        for (let i = 0; i < windows.length; ++i) {
            let tabs = windows[i].tabs;
            for (let j = 0; j < tabs.length; ++j) {
                chrome.tabs.sendMessage(tabs[j].id, { type: 'disable' }).catch(() => {});
            }
        }
    });

    chrome.contextMenus.removeAll();
}

async function activateExtensionToggle(currentTab) {
    if (isActivated) {
        await deactivateExtension();
    } else {
        await activateExtension(currentTab.id, true);
    }
}

async function enableTab(tabId) {
    let { enabled } = await getStorage('enabled');
    if (enabled !== '1') return;

    if (!isActivated) {
        await activateExtension(tabId, false);
        return;
    }

    let options = await getOptions();
    chrome.tabs.sendMessage(tabId, { type: 'enable', config: options }).catch(() => {});
}

function search(text) {
    if (!dict) return;

    let entry = dict.wordSearch(text);
    if (entry) {
        for (let i = 0; i < entry.data.length; i++) {
            let word = entry.data[i][1];
            if (dict.hasGrammarKeyword(word) && (entry.matchLen === word.length)) {
                entry.grammar = { keyword: word, index: i };
            }
            if (dict.hasVocabKeyword(word) && (entry.matchLen === word.length)) {
                entry.vocab = { keyword: word, index: i };
            }
        }
    }
    return entry;
}

chrome.action.onClicked.addListener(activateExtensionToggle);

chrome.tabs.onActivated.addListener(activeInfo => {
    if (activeInfo.tabId === tabIDs['wordlist']) {
        chrome.tabs.reload(activeInfo.tabId);
    } else if (activeInfo.tabId !== tabIDs['help']) {
        enableTab(activeInfo.tabId);
    }
});
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    if (changeInfo.status === 'complete' && tabId !== tabIDs['help'] && tabId !== tabIDs['wordlist']) {
        enableTab(tabId);
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'open-wordlist') {
        openInternalTab('/wordlist.html', 'wordlist');
    } else if (info.menuItemId === 'show-help') {
        openInternalTab('/help.html', 'help');
    } else if (info.menuItemId === 'breakdown-selection' && tab) {
        chrome.tabs.sendMessage(tab.id, {
            type: 'breakdown-selection',
            text: info.selectionText
        }).catch(() => {});
    }
});

function openInternalTab(url, tabType) {
    let tabID = tabIDs[tabType];
    if (tabID) {
        chrome.tabs.get(tabID, function (tab) {
            if (!chrome.runtime.lastError && tab && tab.url && tab.url.endsWith(url.replace(/^\//, ''))) {
                chrome.tabs.update(tabID, { active: true });
            } else {
                createTab(url, tabType);
            }
        });
    } else {
        createTab(url, tabType);
    }
}

function createTab(url, tabType) {
    chrome.tabs.create({ url }, tab => {
        tabIDs[tabType] = tab.id;
    });
}

// ── Sentence Breakdown: cache, rate limit, retry ─────────────────────

let breakdownCache = {};
let breakdownCacheKeys = [];
const CACHE_MAX = 50;
let lastRequestTime = 0;
const MIN_REQUEST_GAP = 2000;
let inflightSentence = null;

function cacheGet(sentence) {
    return breakdownCache[sentence] || null;
}

function cachePut(sentence, response) {
    if (breakdownCache[sentence]) return;
    breakdownCache[sentence] = response;
    breakdownCacheKeys.push(sentence);
    if (breakdownCacheKeys.length > CACHE_MAX) {
        let old = breakdownCacheKeys.shift();
        delete breakdownCache[old];
    }
}

function callProvider(provider, apiKey, prompt) {
    if (provider === 'anthropic') {
        return fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 2048,
                messages: [{ role: 'user', content: prompt }]
            })
        });
    } else if (provider === 'gemini') {
        let url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
        return fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 }
            })
        });
    } else if (provider === 'openai') {
        return fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                max_tokens: 2048,
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' }
            })
        });
    }
    return Promise.reject(new Error('Unknown provider: ' + provider));
}

function extractText(provider, data) {
    if (provider === 'anthropic') {
        return data.content && data.content[0] && data.content[0].text || '';
    } else if (provider === 'gemini') {
        return data.candidates && data.candidates[0] &&
            data.candidates[0].content && data.candidates[0].content.parts &&
            data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text || '';
    } else if (provider === 'openai') {
        return data.choices && data.choices[0] &&
            data.choices[0].message && data.choices[0].message.content || '';
    }
    return '';
}

function handleBreakdown(request, callback) {
    let sentence = request.sentence || '';

    let cached = cacheGet(sentence);
    if (cached) { callback(cached); return; }

    if (inflightSentence === sentence) {
        callback({ error: 'Request already in progress for this sentence.' });
        return;
    }

    chrome.storage.local.get(
        ['aiProvider', 'anthropicApiKey', 'geminiApiKey', 'openaiApiKey'],
        function (result) {
            let provider = result.aiProvider || 'gemini';
            let keyMap = {
                anthropic: result.anthropicApiKey,
                gemini: result.geminiApiKey,
                openai: result.openaiApiKey
            };
            let apiKey = keyMap[provider];
            if (!apiKey) {
                callback({ error: 'No API key set for ' + provider + '. Open Zhongwen Options to add one.' });
                return;
            }

            let now = Date.now();
            let wait = Math.max(0, MIN_REQUEST_GAP - (now - lastRequestTime));

            inflightSentence = sentence;

            setTimeout(function () {
                lastRequestTime = Date.now();

                function doFetch(retryCount) {
                    callProvider(provider, apiKey, request.prompt)
                        .then(r => {
                            if (r.status === 429 && retryCount < 1) {
                                let retryAfter = 5000;
                                let ra = r.headers.get('retry-after');
                                if (ra) retryAfter = Math.min(parseInt(ra, 10) * 1000 || 5000, 30000);
                                return new Promise(resolve => setTimeout(resolve, retryAfter))
                                    .then(() => doFetch(retryCount + 1));
                            }
                            if (!r.ok) return r.text().then(t => { throw new Error('API ' + r.status + ': ' + t); });
                            return r.json();
                        })
                        .then(data => {
                            if (!data) return;
                            let text = extractText(provider, data);
                            let providerNames = { anthropic: 'Claude', gemini: 'Gemini', openai: 'ChatGPT' };
                            let response = { text: text, provider: providerNames[provider] || provider };
                            cachePut(sentence, response);
                            inflightSentence = null;
                            callback(response);
                        })
                        .catch(err => {
                            inflightSentence = null;
                            callback({ error: err.message || 'Unknown error' });
                        });
                }

                doFetch(0);
            }, wait);
        }
    );
}

async function handleAdd(request) {
    let { wordlist: json, saveToWordList } = await getStorage(['wordlist', 'saveToWordList']);
    let saveFirstEntryOnly = saveToWordList === 'firstEntryOnly';

    let wordlist = json ? JSON.parse(json) : [];
    let listName = request.list || '';

    for (let i in request.entries) {
        let src = request.entries[i];
        let entry = {};
        entry.timestamp = Date.now();
        entry.simplified = src.simplified;
        entry.traditional = src.traditional;
        entry.pinyin = src.pinyin;
        entry.definition = src.definition;
        if (src.isSentence) entry.isSentence = true;
        if (src.notes) entry.notes = src.notes;
        if (src.box) entry.box = src.box;
        if (src.breakdown) entry.breakdown = src.breakdown;
        if (listName) entry.list = listName;

        wordlist.push(entry);

        if (saveFirstEntryOnly) break;
    }
    await setStorage({ wordlist: JSON.stringify(wordlist) });
}

chrome.runtime.onMessage.addListener(function (request, sender, callback) {

    let tabID;

    switch (request.type) {

        case 'search': {
            let response = search(request.text);
            if (response) response.originalText = request.originalText;
            callback(response);
        }
            break;

        case 'open': {
            tabID = tabIDs[request.tabType];
            if (tabID) {
                chrome.tabs.get(tabID, () => {
                    if (!chrome.runtime.lastError) {
                        chrome.tabs.update(tabID, { active: true, url: request.url });
                    } else {
                        createTab(request.url, request.tabType);
                    }
                });
            } else {
                createTab(request.url, request.tabType);
            }
        }
            break;

        case 'updateIcon':
            updateIcon();
            break;

        case 'add': {
            handleAdd(request);
        }
            break;

        case 'breakdown': {
            handleBreakdown(request, callback);
            return true;
        }

        case 'thesaurus': {
            findSynonyms(request.simplified, request.traditional)
                .then(synonyms => callback({ synonyms: synonyms }))
                .catch(() => callback({ synonyms: [] }));
            return true;
        }
    }
});

// On service-worker startup, restore activation state from storage so the
// badge and dictionary come back when the worker wakes from idle.
(async function init() {
    let { enabled } = await getStorage('enabled');
    if (enabled === '1') {
        isActivated = true;
        loadDictionary().then(r => dict = r);
        chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
        chrome.action.setBadgeText({ text: 'On' });
        await rebuildContextMenus();
        await updateIcon();
    }
})();
