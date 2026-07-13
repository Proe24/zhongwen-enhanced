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
    'toneColorScheme', 'direction', 'mode', 'density', 'hanziFont', 'defView',
    'popupScale', 'saveToWordList'
];
const OPTION_DEFAULTS = {
    tonecolors: 'yes', skritterTLD: 'com', zhuyin: 'no', grammar: 'yes',
    vocab: 'yes', simpTrad: 'classic', toneColorScheme: 'standard',
    direction: 'vellum', mode: 'light', density: 'regular', hanziFont: 'serif',
    defView: 'full', popupScale: '1', saveToWordList: 'allEntries'
};

let isActivated = false;
let activationGeneration = 0;
let resolveActivationStateReady;
const activationStateReady = new Promise(resolve => { resolveActivationStateReady = resolve; });
let tabIDs = {};
let dict;
let dictLoading;
let thesaurus;        // word -> [synonyms], lazily loaded from data/thesaurus.json
let thesaurusLoading; // in-flight load promise, so concurrent lookups share one fetch

function getStorage(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, function (result) {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result || {});
            }
        });
    });
}

function setStorage(obj) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(obj, function () {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve();
            }
        });
    });
}

async function getOptions() {
    let result = await getStorage(OPTION_KEYS);
    let out = {};
    OPTION_KEYS.forEach(k => { out[k] = result[k] !== undefined ? result[k] : OPTION_DEFAULTS[k]; });
    return out;
}

async function activateExtension(tabId, showHelp) {
    let generation = ++activationGeneration;
    isActivated = true;
    try {
        await setStorage({ enabled: '1' });
    } catch (error) {
        if (generation === activationGeneration) isActivated = false;
        throw error;
    }
    await ensureDictionary();
    if (!isActivated || generation !== activationGeneration) return;

    let options = await getOptions();
    if (!isActivated || generation !== activationGeneration) return;

    try {
        await chrome.tabs.sendMessage(tabId, { type: 'enable', config: options });
    } catch (e) { /* tab may not have content script (chrome:// etc.) */ }
    if (!isActivated || generation !== activationGeneration) return;

    if (showHelp) {
        try {
            await chrome.tabs.sendMessage(tabId, { type: 'showHelp' });
        } catch (e) { /* tab may not have a content script */ }
    }
    if (!isActivated || generation !== activationGeneration) return;

    await rebuildContextMenus(generation);
    if (!isActivated || generation !== activationGeneration) return;
    chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
    chrome.action.setBadgeText({ text: 'On' });
    await updateIcon();
}

async function rebuildContextMenus(generation) {
    await new Promise(resolve => chrome.contextMenus.removeAll(resolve));
    if (!isActivated || generation !== activationGeneration) return;
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

function ensureDictionary() {
    if (dict) return Promise.resolve(dict);
    if (!dictLoading) {
        dictLoading = loadDictionary()
            .then(result => {
                dict = result;
                return result;
            })
            .finally(() => { dictLoading = null; });
    }
    return dictLoading;
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
    let generation = ++activationGeneration;
    isActivated = false;
    try {
        await setStorage({ enabled: '0' });
    } catch (error) {
        if (generation === activationGeneration) isActivated = true;
        throw error;
    }
    if (isActivated || generation !== activationGeneration) return;

    chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] });
    chrome.action.setBadgeText({ text: '' });

    chrome.windows.getAll({ populate: true }, function (windows) {
        if (isActivated || generation !== activationGeneration) return;
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
    await activationStateReady;
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
let providerQueue = Promise.resolve();
let inflightBreakdowns = new Map();

function cacheGet(key) {
    return breakdownCache[key] || null;
}

function cachePut(key, response) {
    if (breakdownCache[key]) return;
    breakdownCache[key] = response;
    breakdownCacheKeys.push(key);
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function enqueueProviderCall(task) {
    let run = providerQueue.then(async function () {
        let wait = Math.max(0, MIN_REQUEST_GAP - (Date.now() - lastRequestTime));
        if (wait) await delay(wait);
        lastRequestTime = Date.now();
        return task();
    });
    providerQueue = run.catch(() => {});
    return run;
}

async function fetchProviderResponse(provider, apiKey, prompt, retryCount) {
    let response = await callProvider(provider, apiKey, prompt);
    if (response.status === 429 && retryCount < 1) {
        let retryAfter = 5000;
        let header = response.headers.get('retry-after');
        if (header) retryAfter = Math.min(parseInt(header, 10) * 1000 || 5000, 30000);
        await delay(retryAfter);
        return fetchProviderResponse(provider, apiKey, prompt, retryCount + 1);
    }
    if (!response.ok) {
        let body = await response.text();
        throw new Error('API ' + response.status + ': ' + body);
    }
    return response.json();
}

async function performBreakdown(request) {
    let sentence = request.sentence || '';
    let result = await getStorage(
        ['aiProvider', 'anthropicApiKey', 'geminiApiKey', 'openaiApiKey']
    );
    let provider = result.aiProvider || 'gemini';
    let keyMap = {
        anthropic: result.anthropicApiKey,
        gemini: result.geminiApiKey,
        openai: result.openaiApiKey
    };
    let apiKey = keyMap[provider];
    let providerNames = { anthropic: 'Claude', gemini: 'Gemini', openai: 'ChatGPT' };
    let providerName = providerNames[provider] || provider;
    if (!apiKey) {
        return {
            error: 'No API key set for ' + provider + '. Open Zhongwen Options to add one.',
            provider: providerName
        };
    }

    let key = provider + '\n' + sentence;
    let cached = cacheGet(key);
    if (cached) return cached;
    if (inflightBreakdowns.has(key)) return inflightBreakdowns.get(key);

    let pending = enqueueProviderCall(async function () {
        let data = await fetchProviderResponse(provider, apiKey, request.prompt, 0);
        let response = { text: extractText(provider, data), provider: providerName };
        cachePut(key, response);
        return response;
    }).catch(err => ({
        error: err.message || 'Unknown error',
        provider: providerName
    })).finally(() => {
        if (inflightBreakdowns.get(key) === pending) inflightBreakdowns.delete(key);
    });

    inflightBreakdowns.set(key, pending);
    return pending;
}

function handleBreakdown(request, callback) {
    performBreakdown(request).then(callback, error => callback({
        error: error && error.message ? error.message : 'Unknown error'
    }));
}

let wordlistQueue = Promise.resolve();

function createEntryId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

function createLegacyEntryId(entry, occurrence) {
    // Use fields that word-list mutations do not edit so a best-effort ID stays
    // stable even when the migration cannot be persisted and the worker wakes
    // again later. The occurrence suffix distinguishes otherwise identical
    // legacy records.
    let identity = {};
    [
        'timestamp', 'simplified', 'traditional', 'pinyin', 'definition',
        'isSentence', 'breakdown'
    ].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(entry, key)) identity[key] = entry[key];
    });
    let value = JSON.stringify(identity);
    let first = 2166136261;
    let second = 5381;
    for (let i = 0; i < value.length; i++) {
        let code = value.charCodeAt(i);
        first = Math.imul(first ^ code, 16777619);
        second = ((second << 5) + second) ^ code;
    }
    return 'legacy-' + (first >>> 0).toString(36) + '-' +
        (second >>> 0).toString(36) + '-' + occurrence.toString(36);
}

function enqueueWordlistTask(task) {
    let run = wordlistQueue.then(task);
    wordlistQueue = run.catch(() => { /* keep later mutations running */ });
    return run;
}

async function readWordlist() {
    let { wordlist: json } = await getStorage('wordlist');
    let entries;
    try {
        entries = json ? JSON.parse(json) : [];
    } catch (error) {
        throw new Error('Saved word list is not valid JSON.');
    }
    if (!Array.isArray(entries)) throw new Error('Saved word list has an invalid format.');

    let generatedIds = new Set();
    let occurrences = new Map();
    entries.forEach(entry => {
        if (!entry.id) {
            let fingerprint = JSON.stringify([
                entry.timestamp, entry.simplified, entry.traditional, entry.pinyin,
                entry.definition, entry.isSentence, entry.breakdown
            ]);
            let occurrence = occurrences.get(fingerprint) || 0;
            occurrences.set(fingerprint, occurrence + 1);
            entry.id = createLegacyEntryId(entry, occurrence);
            generatedIds.add(entry.id);
        }
    });
    let transientIds = new Set();
    if (generatedIds.size) {
        try {
            await setStorage({ wordlist: JSON.stringify(entries) });
        } catch (error) {
            // ID persistence is an upgrade convenience. Reads must still work
            // when the expanded legacy JSON exceeds the storage quota.
            transientIds = generatedIds;
        }
    }
    return { entries: entries, transientIds: transientIds };
}

function serializeWordlist(wordlist, transientIds) {
    if (!transientIds.size) return JSON.stringify(wordlist);
    return JSON.stringify(wordlist.map(entry => {
        if (!transientIds.has(entry.id)) return entry;
        let stored = Object.assign({}, entry);
        delete stored.id;
        return stored;
    }));
}

function requireWordlistIds(wordlist, ids) {
    let existingIds = new Set(wordlist.map(entry => entry.id));
    for (let id of ids) {
        if (!existingIds.has(id)) {
            throw new Error('The word list changed. Reload it and try again.');
        }
    }
}

function handleAdd(request) {
    return enqueueWordlistTask(async function () {
        let [wordlistState, options] = await Promise.all([
            readWordlist(),
            getStorage('saveToWordList')
        ]);
        let wordlist = wordlistState.entries;
        let saveFirstEntryOnly = request.saveMode !== 'all' &&
            options.saveToWordList === 'firstEntryOnly';
        let listName = request.list || '';

        for (let src of request.entries || []) {
            let entry = {
                id: createEntryId(),
                timestamp: Date.now(),
                simplified: src.simplified,
                traditional: src.traditional,
                pinyin: src.pinyin,
                definition: src.definition
            };
            if (src.isSentence) entry.isSentence = true;
            if (src.notes) entry.notes = src.notes;
            if (src.box) entry.box = src.box;
            if (src.breakdown) entry.breakdown = src.breakdown;
            if (listName) entry.list = listName;
            wordlist.push(entry);
            if (saveFirstEntryOnly) break;
        }
        await setStorage({
            wordlist: serializeWordlist(wordlist, wordlistState.transientIds)
        });
        return wordlist;
    });
}

function mutateWordlist(request) {
    return enqueueWordlistTask(async function () {
        let wordlistState = await readWordlist();
        let wordlist = wordlistState.entries;
        let ids = new Set(request.ids || []);

        switch (request.operation) {
            case 'delete':
                requireWordlistIds(wordlist, ids);
                wordlist = wordlist.filter(entry => !ids.has(entry.id));
                break;
            case 'move':
                requireWordlistIds(wordlist, ids);
                wordlist.forEach(entry => {
                    if (ids.has(entry.id)) entry.list = request.list || '';
                });
                break;
            case 'rename-list':
                wordlist.forEach(entry => {
                    if ((entry.list || '') === request.oldName) entry.list = request.newName || '';
                });
                break;
            case 'update': {
                let entry = wordlist.find(item => item.id === request.id);
                if (!entry) throw new Error('The word list changed. Reload it and try again.');
                let patch = request.patch || {};
                ['notes', 'box', 'lastReviewed'].forEach(key => {
                    if (Object.prototype.hasOwnProperty.call(patch, key)) entry[key] = patch[key];
                });
                break;
            }
            default:
                throw new Error('Unknown word-list operation: ' + request.operation);
        }

        await setStorage({
            wordlist: serializeWordlist(wordlist, wordlistState.transientIds)
        });
        return wordlist;
    });
}

chrome.runtime.onMessage.addListener(function (request, sender, callback) {

    let tabID;

    switch (request.type) {

        case 'search': {
            ensureDictionary().then(() => {
                let response = search(request.text);
                if (response) response.originalText = request.originalText;
                callback(response);
            }).catch(() => callback());
            return true;
        }

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
            handleAdd(request).then(() => callback({ ok: true }))
                .catch(error => callback({ error: error.message }));
            return true;
        }

        case 'wordlist-get': {
            enqueueWordlistTask(readWordlist)
                .then(result => callback({ entries: result.entries }))
                .catch(error => callback({ error: error.message }));
            return true;
        }

        case 'wordlist-mutate': {
            mutateWordlist(request)
                .then(entries => callback({ entries: entries }))
                .catch(error => callback({ error: error.message }));
            return true;
        }

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
    let generation = ++activationGeneration;
    try {
        let { enabled } = await getStorage('enabled');
        if (generation !== activationGeneration) return;
        if (enabled === '1') {
            isActivated = true;
            resolveActivationStateReady();
            await ensureDictionary();
            if (!isActivated || generation !== activationGeneration) return;
            await rebuildContextMenus(generation);
            if (!isActivated || generation !== activationGeneration) return;
            chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
            chrome.action.setBadgeText({ text: 'On' });
            await updateIcon();
        }
    } finally {
        resolveActivationStateReady();
    }
})();
