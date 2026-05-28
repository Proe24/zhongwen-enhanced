/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
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

let isEnabled = localStorage['enabled'] === '1';

let isActivated = false;

let tabIDs = {};

let dict;

let zhongwenOptions = window.zhongwenOptions = {
    tonecolors: localStorage['tonecolors'] || 'yes',
    skritterTLD: localStorage['skritterTLD'] || 'com',
    zhuyin: localStorage['zhuyin'] || 'no',
    grammar: localStorage['grammar'] || 'yes',
    vocab: localStorage['vocab'] || 'yes',
    simpTrad: localStorage['simpTrad'] || 'classic',
    toneColorScheme: localStorage['toneColorScheme'] || 'standard',
    direction: localStorage['direction'] || 'vellum',
    mode: localStorage['mode'] || 'light',
    density: localStorage['density'] || 'regular',
    hanziFont: localStorage['hanziFont'] || 'serif'
};

function activateExtension(tabId, showHelp) {

    isActivated = true;

    isEnabled = true;
    // values in localStorage are always strings
    localStorage['enabled'] = '1';

    if (!dict) {
        loadDictionary().then(r => dict = r);
    }

    chrome.tabs.sendMessage(tabId, {
        'type': 'enable',
        'config': zhongwenOptions
    });

    if (showHelp) {
        chrome.tabs.sendMessage(tabId, {
            'type': 'showHelp'
        });
    }

    chrome.browserAction.setBadgeBackgroundColor({
        'color': [255, 0, 0, 255]
    });

    chrome.browserAction.setBadgeText({
        'text': 'On'
    });

    chrome.contextMenus.create(
        {
            title: 'Open word list',
            onclick: function () {
                let url = '/wordlist.html';
                let tabID = tabIDs['wordlist'];
                if (tabID) {
                    chrome.tabs.get(tabID, function (tab) {
                        if (tab && tab.url && (tab.url.endsWith('wordlist.html'))) {
                            chrome.tabs.update(tabID, {
                                active: true
                            });
                        } else {
                            chrome.tabs.create({
                                url: url
                            }, function (tab) {
                                tabIDs['wordlist'] = tab.id;
                            });
                        }
                    });
                } else {
                    chrome.tabs.create(
                        { url: url },
                        function (tab) {
                            tabIDs['wordlist'] = tab.id;
                        }
                    );
                }
            }
        }
    );
    chrome.contextMenus.create(
        {
            title: 'Show help in new tab',
            onclick: function () {
                let url = '/help.html';
                let tabID = tabIDs['help'];
                if (tabID) {
                    chrome.tabs.get(tabID, function (tab) {
                        if (tab && (tab.url.endsWith('help.html'))) {
                            chrome.tabs.update(tabID, {
                                active: true
                            });
                        } else {
                            chrome.tabs.create({
                                url: url
                            }, function (tab) {
                                tabIDs['help'] = tab.id;
                            });
                        }
                    });
                } else {
                    chrome.tabs.create(
                        { url: url },
                        function (tab) {
                            tabIDs['help'] = tab.id;
                        }
                    );
                }
            }
        }
    );
    chrome.contextMenus.create(
        {
            title: 'Zhongwen: Break down sentence',
            contexts: ['selection'],
            onclick: function (info, tab) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'breakdown-selection',
                    text: info.selectionText
                });
            }
        }
    );

    updateIcon();
}

function updateIcon() {
    let direction = localStorage['direction'] || 'vellum';
    let accents = { vellum: '#8a3324', slate: '#1c4670', crimson: '#b3271f' };
    let textColors = { vellum: '#fbf4df', slate: '#ffffff', crimson: '#fbf6e3' };
    let radii = { vellum: 4, slate: 2, crimson: 1 };
    let accent = accents[direction];
    let textColor = textColors[direction];
    let baseRad = radii[direction];
    let imageData = {};

    [16, 48].forEach(function (size) {
        let canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
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

    chrome.browserAction.setIcon({ imageData: imageData });
}

async function loadDictData() {
    let wordDict = fetch(chrome.runtime.getURL(
        "data/cedict_ts.u8")).then(r => r.text());
    let wordIndex = fetch(chrome.runtime.getURL(
        "data/cedict.idx")).then(r => r.text());
    let grammarKeywords = fetch(chrome.runtime.getURL(
        "data/grammarKeywordsMin.json")).then(r => r.json());
    let vocabKeywords = fetch(chrome.runtime.getURL(
        "data/vocabularyKeywordsMin.json")).then(r => r.json());

    return Promise.all([wordDict, wordIndex, grammarKeywords, vocabKeywords]);
}


async function loadDictionary() {
    let [wordDict, wordIndex, grammarKeywords, vocabKeywords] = await loadDictData();
    return new ZhongwenDictionary(wordDict, wordIndex, grammarKeywords, vocabKeywords);
}

function deactivateExtension() {

    isActivated = false;

    isEnabled = false;
    // values in localStorage are always strings
    localStorage['enabled'] = '0';

    dict = undefined;

    chrome.browserAction.setBadgeBackgroundColor({
        'color': [0, 0, 0, 0]
    });

    chrome.browserAction.setBadgeText({
        'text': ''
    });

    // Send a disable message to all tabs in all windows.
    chrome.windows.getAll(
        { 'populate': true },
        function (windows) {
            for (let i = 0; i < windows.length; ++i) {
                let tabs = windows[i].tabs;
                for (let j = 0; j < tabs.length; ++j) {
                    chrome.tabs.sendMessage(tabs[j].id, {
                        'type': 'disable'
                    });
                }
            }
        }
    );

    chrome.contextMenus.removeAll();
}

function activateExtensionToggle(currentTab) {
    if (isActivated) {
        deactivateExtension();
    } else {
        activateExtension(currentTab.id, true);
    }
}

function enableTab(tabId) {
    if (isEnabled) {

        if (!isActivated) {
            activateExtension(tabId, false);
        }

        chrome.tabs.sendMessage(tabId, {
            'type': 'enable',
            'config': zhongwenOptions
        });
    }
}

function search(text) {

    if (!dict) {
        // dictionary not loaded
        return;
    }

    let entry = dict.wordSearch(text);

    if (entry) {
        for (let i = 0; i < entry.data.length; i++) {
            let word = entry.data[i][1];
            if (dict.hasGrammarKeyword(word) && (entry.matchLen === word.length)) {
                // the final index should be the last one with the maximum length
                entry.grammar = { keyword: word, index: i };
            }
            if (dict.hasVocabKeyword(word) && (entry.matchLen === word.length)) {
                // the final index should be the last one with the maximum length
                entry.vocab = { keyword: word, index: i };
            }
        }
    }

    return entry;
}

chrome.browserAction.onClicked.addListener(activateExtensionToggle);

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

    // Check cache first
    let cached = cacheGet(sentence);
    if (cached) {
        callback(cached);
        return;
    }

    // Deduplicate: skip if same sentence is already in flight
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

            // Rate limit: wait if too soon after last request
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

chrome.runtime.onMessage.addListener(function (request, sender, callback) {

    let tabID;

    switch (request.type) {

        case 'search': {
            let response = search(request.text);
            response.originalText = request.originalText;
            callback(response);
        }
            break;

        case 'open': {
            tabID = tabIDs[request.tabType];
            if (tabID) {
                chrome.tabs.get(tabID, () => {
                    if (!chrome.runtime.lastError) {
                        // activate existing tab
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

        case 'copy': {
            let txt = document.createElement('textarea');
            txt.style.position = "absolute";
            txt.style.left = "-100%";
            txt.value = request.data;
            document.body.appendChild(txt);
            txt.select();
            document.execCommand('copy');
            document.body.removeChild(txt);
        }
            break;

        case 'add': {
            let json = localStorage['wordlist'];

            let saveFirstEntryOnly = localStorage['saveToWordList'] === 'firstEntryOnly';

            let wordlist;
            if (json) {
                wordlist = JSON.parse(json);
            } else {
                wordlist = [];
            }

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

                if (saveFirstEntryOnly) {
                    break;
                }
            }
            localStorage['wordlist'] = JSON.stringify(wordlist);

            tabID = tabIDs['wordlist'];
        }
            break;

        case 'breakdown': {
            handleBreakdown(request, callback);
            return true;
        }
    }
});
