/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2010-2023 Christian Schiller
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

let config;

let savedTarget;

let savedRangeNode;

let savedRangeOffset;

let selText;

let clientX;

let clientY;

let selStartDelta;

let selStartIncrement;

let popX = 0;

let popY = 0;

// Viewport rect of the currently highlighted word, used to anchor the popup
// to the word itself (consistent gap above/below) rather than the mouse cursor.
// Null when there is no highlight (e.g. inside form fields) — then we fall back
// to mouse-based positioning.
let wordRect = null;

// Manual vertical nudge applied with the X / Y keys; reset on each new hover.
let popYOffset = 0;

let timer;

let altView = 0;

// Compact view: show only one meaning at a time, cycled with the keyboard.
let compactView = false;        // current view state (per session, seeded from config.defView)
let compactPos = 0;             // index into compactFlat — resets to 0 (most common) on each new word
let compactFlat = [];           // flat [entryIndex, senseIndex] pairs, in "senses then entries" order
let showKeys = false;           // shortcut hints collapsed by default; '?' toggles them (per session)
let userToggledView = false;    // set once the user presses D/F, so a manual choice isn't overridden on refocus
let lastEntries = [];           // parsed entries for the shown word, so cycling re-renders without re-parsing
let lastMore = false;           // whether the shown result was truncated ("…")
let lastResultKey = null;       // identity of the shown word, to reset the cycle only on a genuinely new word
let popupShowsResult = false;   // true only while the popup shows a dictionary entry (not a message/help)

let savedSearchResults = [];

let savedSelStartOffset = 0;

let savedSelEndList = [];

// regular expression for zero-width non-joiner U+200C &zwnj;
let zwnj = /\u200c/g;

function enableTab() {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
}

function disableTab() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('keydown', onKeyDown);

    let popup = document.getElementById('zhongwen-window');
    if (popup) {
        popup.parentNode.removeChild(popup);
    }

    let panel = document.getElementById('zhongwen-panel');
    if (panel) {
        panel.parentNode.removeChild(panel);
    }
    invalidatePanelSession();

    clearHighlight();
}

// ── Sentence Breakdown Panel ─────────────────────────────────────────

let panelOpen = false;
let panelGeneration = 0;
let activePanelKind = '';
let activePanelKey = '';

function beginPanelSession(kind, key) {
    if (panelOpen && activePanelKind === kind && activePanelKey === key) return null;
    panelGeneration++;
    panelOpen = true;
    activePanelKind = kind;
    activePanelKey = key;
    return panelGeneration;
}

function isCurrentPanelSession(generation) {
    return panelOpen && panelGeneration === generation;
}

function invalidatePanelSession() {
    panelGeneration++;
    panelOpen = false;
    activePanelKind = '';
    activePanelKey = '';
}

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSurroundingSentence() {
    if (!savedRangeNode || !savedRangeNode.textContent) return '';
    let block = savedRangeNode.nodeType === 3 ? savedRangeNode.parentNode : savedRangeNode;
    while (block && block !== document.body) {
        let display = window.getComputedStyle(block).display;
        if (display === 'block' || display === 'flex' || display === 'list-item' ||
            display === 'table-cell' || block.tagName === 'P' || block.tagName === 'DIV' ||
            block.tagName === 'LI' || block.tagName === 'TD' || block.tagName === 'H1' ||
            block.tagName === 'H2' || block.tagName === 'H3' || block.tagName === 'H4') break;
        block = block.parentNode;
    }
    if (!block || block === document.body) block = savedRangeNode.parentNode;

    let text = block.textContent;
    let cursorOffset = 0;
    let walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
        if (node === savedRangeNode) {
            cursorOffset += savedRangeOffset;
            break;
        }
        cursorOffset += node.textContent.length;
    }

    let offset = Math.min(cursorOffset, text.length);
    let sentenceEnders = /[。！？\n\r]/;
    let start = offset;
    while (start > 0 && !sentenceEnders.test(text[start - 1])) start--;
    let end = offset;
    while (end < text.length && !sentenceEnders.test(text[end])) end++;
    return text.substring(start, end).trim();
}

function buildBreakdownPrompt(text) {
    let sentenceShape =
        '{ "hz": "<hanzi token>", "py": "pinyin with tone numbers like zhong1 guo2", "gloss": "short English", "role": "subject|verb|object|particle|adverb|conjunction|preposition|measure|topic|complement|aspect|other" }';
    let breakdownShape =
        '{\n' +
        '  "literal": "word-by-word literal English (clunky but transparent)",\n' +
        '  "idiomatic": "natural fluent English translation",\n' +
        '  "grammar": [\n    "One concise grammar/usage note. Wrap key Chinese terms in **bold**."\n  ],\n' +
        '  "words": [\n    ' + sentenceShape + '\n  ]\n' +
        '}';

    let prompt = 'You are a precise Chinese language tutor. Analyze this sentence: "' + text + '"\n\n' +
        'Respond with ONLY a JSON object (no markdown fences, no prose):\n\n' + breakdownShape;

    prompt += '\n\nRules:\n' +
        '- Split into the natural word units a learner would look up (not single characters unless they stand alone).\n' +
        '- Use tone-number pinyin: e.g. "zhong1 guo2", "de5" for neutral tone.\n' +
        '- 2-4 grammar notes per sentence max. Keep them learner-facing, not academic.\n' +
        '- No trailing commas. Valid JSON only.';
    return prompt;
}

function createPanel() {
    let panel = document.getElementById('zhongwen-panel');
    if (panel) return panel;
    panel = document.createElement('aside');
    panel.id = 'zhongwen-panel';
    panel.className = 'cz-side';
    panel.setAttribute('data-direction', config.direction || 'vellum');
    panel.setAttribute('data-mode', config.mode || 'light');
    panel.innerHTML =
        '<header>' +
            '<span class="title" id="zhongwen-panel-title">Sentence Breakdown</span>' +
            '<button class="close" id="zhongwen-panel-close">&times;</button>' +
        '</header>' +
        '<div class="scroll" id="zhongwen-panel-scroll"></div>';
    document.documentElement.appendChild(panel);
    document.getElementById('zhongwen-panel-close').addEventListener('click', closePanel);
    return panel;
}

function openPanel(sentence) {
    if (!sentence) return;
    let generation = beginPanelSession('sentence', sentence);
    if (generation === null) return;
    let panel = createPanel();
    panel.setAttribute('data-direction', config.direction || 'vellum');
    panel.setAttribute('data-mode', config.mode || 'light');
    let title = document.getElementById('zhongwen-panel-title');
    if (title) title.textContent = 'Sentence Breakdown';
    let scroll = document.getElementById('zhongwen-panel-scroll');

    scroll.innerHTML =
        '<div class="src-sentence">' + escapeHtml(sentence) + '</div>' +
        '<div class="ai-status" id="zhongwen-panel-status">' +
            '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
            '<span>Analyzing sentence…</span>' +
        '</div>';

    chrome.storage.local.get('aiProvider', function (result) {
        if (!isCurrentPanelSession(generation)) return;
        let names = { anthropic: 'Claude', gemini: 'Gemini', openai: 'ChatGPT' };
        let name = names[result.aiProvider] || 'AI';
        let el = document.getElementById('zhongwen-panel-status');
        if (el) el.innerHTML =
            '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
            '<span>Asking ' + name + ' to break down sentence…</span>';
    });

    requestAnimationFrame(function () {
        if (isCurrentPanelSession(generation)) panel.classList.add('is-open');
    });

    chrome.runtime.sendMessage({
        type: 'breakdown',
        sentence: sentence,
        prompt: buildBreakdownPrompt(sentence)
    }, function (response) {
        if (!isCurrentPanelSession(generation)) return;
        if (!response || response.error) {
            let errMsg = (response && response.error) || 'Unknown error';
            let providerLabel = (response && response.provider) || 'the AI provider';
            let friendly = 'Something went wrong.';
            if (errMsg.indexOf('No API key') >= 0) {
                friendly = errMsg;
            } else if (errMsg.indexOf('401') >= 0 || errMsg.indexOf('authentication') >= 0) {
                friendly = 'Authentication failed — check your API key in Zhongwen Options.';
            } else if (errMsg.indexOf('429') >= 0 || errMsg.indexOf('quota') >= 0 || errMsg.indexOf('RESOURCE_EXHAUSTED') >= 0) {
                friendly = 'Rate limit reached — wait a minute and try again, or switch providers in Options.';
            } else if (errMsg.indexOf('403') >= 0) {
                friendly = 'Access denied — your API key may not have the right permissions.';
            } else {
                friendly = errMsg.length > 200 ? errMsg.substring(0, 200) + '…' : errMsg;
            }
            scroll.innerHTML =
                '<div class="src-sentence">' + escapeHtml(sentence) + '</div>' +
                '<div class="grammar-notes" style="border-left-color:var(--tone-1)">' +
                    '<strong>Could not reach ' + escapeHtml(providerLabel) + '.</strong>' +
                    '<p style="margin:6px 0 0;font-size:13px">' + escapeHtml(friendly) + '</p>' +
                '</div>';
            return;
        }
        let providerName = response.provider || 'AI';
        let data = normalizeBreakdownData(parseAIResponse(response.text));
        if (data) {
            renderBreakdown(scroll, sentence, data, providerName);
        } else {
            renderRawFallback(scroll, sentence, String(response.text || ''), providerName);
        }
    });
}

function renderBreakdown(scroll, sentence, data, providerName) {
    let html = '';
    html += '<div class="src-sentence">' + escapeHtml(sentence) + '</div>';

    html += '<div class="translation-grid">';
    html += '<div class="trans-card idiomatic"><div class="label">Idiomatic</div><div class="text">' + escapeHtml(data.idiomatic) + '</div></div>';
    html += '<div class="trans-card literal"><div class="label">Literal</div><div class="text">' + escapeHtml(data.literal) + '</div></div>';
    html += '</div>';

    if (data.words && data.words.length > 0) {
        html += '<div class="section-label">Word by word</div>';
        html += '<div class="breakdown-list">';
        data.words.forEach(function (w, i) {
            html += '<div class="breakdown-row">';
            html += '<div class="hz">' + toneColorHanziNumbered(w.hz, w.py) + '</div>';
            html += '<div class="meta">';
            html += '<div class="py">' + formatNumberedPinyin(w.py) + '</div>';
            html += '<div class="gloss">' + escapeHtml(w.gloss) + '</div>';
            if (w.role && w.role !== 'other') {
                html += '<div class="role">' + escapeHtml(w.role) + '</div>';
            }
            html += '</div>';
            html += '<button class="add-word" data-word-idx="' + i + '" title="Add to word list">+</button>';
            html += '</div>';
        });
        html += '</div>';
    }

    if (data.grammar && data.grammar.length > 0) {
        html += '<div class="section-label">Grammar notes</div>';
        html += '<div class="grammar-notes"><ul>';
        data.grammar.forEach(function (g) {
            let formatted = escapeHtml(g).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            html += '<li>' + formatted + '</li>';
        });
        html += '</ul></div>';
    }

    html += '<div class="ai-foot">';
    html += '<span>Generated by ' + escapeHtml(providerName || 'AI') + '</span>';
    html += '<button class="save" id="zhongwen-panel-save">Save sentence</button>';
    html += '</div>';

    scroll.innerHTML = html;

    scroll.querySelector('#zhongwen-panel-save').addEventListener('click', function () {
        let button = this;
        button.disabled = true;
        saveSentence(sentence, data, function (error) {
            button.disabled = false;
            if (error) {
                button.textContent = 'Save failed';
                button.title = error;
            } else {
                button.classList.add('is-saved');
                button.textContent = '✓ Saved';
            }
        });
    });

    scroll.querySelectorAll('.add-word').forEach(function (btn) {
        btn.addEventListener('click', function () {
            let w = data.words[parseInt(this.dataset.wordIdx)];
            if (!w) return;
            let button = this;
            button.disabled = true;
            sendAddRequest({
                type: 'add',
                entries: [{
                    simplified: w.hz,
                    traditional: w.hz,
                    pinyin: numberedToMarkPinyin(w.py),
                    definition: w.gloss || ''
                }],
                list: document.title || document.location.hostname
            }, function (error) {
                button.disabled = false;
                if (error) {
                    button.textContent = '!';
                    button.title = error;
                } else {
                    button.classList.add('is-saved');
                    button.textContent = '✓';
                }
            });
        });
    });
}

function normalizeBreakdownData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

    let words = Array.isArray(data.words) ? data.words : [];
    words = words.filter(word => word && typeof word === 'object').map(word => ({
        hz: String(word.hz === null || word.hz === undefined ? '' : word.hz),
        py: String(word.py === null || word.py === undefined ? '' : word.py),
        gloss: String(word.gloss === null || word.gloss === undefined ? '' : word.gloss),
        role: String(word.role === null || word.role === undefined ? 'other' : word.role)
    })).filter(word => word.hz || word.py || word.gloss);

    let grammar = Array.isArray(data.grammar)
        ? data.grammar.filter(note => typeof note === 'string')
        : [];

    return {
        literal: String(data.literal === null || data.literal === undefined ? '' : data.literal),
        idiomatic: String(data.idiomatic === null || data.idiomatic === undefined ? '' : data.idiomatic),
        words: words,
        grammar: grammar
    };
}

function parseAIResponse(text) {
    if (typeof text !== 'string' || !text.trim()) return null;
    let raw = text.trim();
    // Strip code fences
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    // Extract first JSON object
    let m = raw.match(/\{[\s\S]*\}/);
    if (!m) return parseAIPlainText(text);
    raw = m[0];

    // Strategy 1: direct parse
    try { return JSON.parse(raw); } catch (e) { /* try the recovery strategies below */ }

    // Strategy 2: collapse newlines, fix trailing commas
    let cleaned = raw.replace(/[\r\n]+/g, ' ').replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(cleaned); } catch (e) { /* try the recovery strategies below */ }

    // Strategy 3: strip control chars, fix smart quotes
    // eslint-disable-next-line no-control-regex
    cleaned = cleaned.replace(/[\x00-\x1f\x7f]/g, ' ')
                     .replace(/“|”/g, '"')
                     .replace(/‘|’/g, "'");
    try { return JSON.parse(cleaned); } catch (e) { /* fall through to field extraction */ }

    // Strategy 4: regex extraction of key fields from near-valid JSON
    try {
        var dq = String.fromCharCode(34);
        var valPat = '((?:[^' + dq + '\\\\]|\\\\.)*)';
        var patI = new RegExp(dq + 'idiomatic' + dq + '\\s*:\\s*' + dq + valPat + dq);
        var patL = new RegExp(dq + 'literal' + dq + '\\s*:\\s*' + dq + valPat + dq);
        var mI = raw.match(patI);
        var mL = raw.match(patL);
        var idiomatic = mI ? mI[1] : '';
        var literal = mL ? mL[1] : '';
        if (idiomatic || literal) {
            var words = [];
            var wordPat = new RegExp(
                '\\{\\s*' + dq + 'hz' + dq + '\\s*:\\s*' + dq + valPat + dq +
                '\\s*,\\s*' + dq + 'py' + dq + '\\s*:\\s*' + dq + valPat + dq +
                '\\s*,\\s*' + dq + 'gloss' + dq + '\\s*:\\s*' + dq + valPat + dq +
                '(?:\\s*,\\s*' + dq + 'role' + dq + '\\s*:\\s*' + dq + valPat + dq + ')?',
                'g'
            );
            var wm;
            while ((wm = wordPat.exec(raw)) !== null) {
                words.push({
                    hz: wm[1].replace(/\\"/g, '"'),
                    py: wm[2].replace(/\\"/g, '"'),
                    gloss: wm[3].replace(/\\"/g, '"'),
                    role: wm[4] ? wm[4].replace(/\\"/g, '"') : 'other'
                });
            }
            var patG = new RegExp(dq + 'grammar' + dq + '\\s*:\\s*\\[([\\s\\S]*?)\\]');
            var mG = raw.match(patG);
            var grammar = [];
            if (mG) {
                var reGI = new RegExp(dq + valPat + dq, 'g');
                var gi;
                while ((gi = reGI.exec(mG[1])) !== null) grammar.push(gi[1]);
            }
            return {
                idiomatic: idiomatic.replace(/\\"/g, '"').replace(/\\n/g, ' '),
                literal: literal.replace(/\\"/g, '"').replace(/\\n/g, ' '),
                words: words,
                grammar: grammar
            };
        }
    } catch (e) { /* fall through to plain-text parsing */ }

    return parseAIPlainText(text);
}

function parseAIPlainText(text) {
    try {
        var fullText = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        var litMatch = fullText.match(/literal\s*:\s*([\s\S]+?)(?=\n\s*(?:idiomatic|words|grammar)\s*:|$)/i);
        var idiMatch = fullText.match(/idiomatic\s*:\s*([\s\S]+?)(?=\n\s*(?:literal|words|grammar)\s*:|$)/i);
        if (litMatch || idiMatch) {
            var ptWords = [];
            var ptWordRe = /hz\s*:\s*([^,]+),\s*py\s*:\s*([^,]+),\s*gloss\s*:\s*([^,]+?)(?:,\s*role\s*:\s*(\S+))?(?:\s*,?\s*)$/gm;
            var ptm;
            while ((ptm = ptWordRe.exec(fullText)) !== null) {
                ptWords.push({
                    hz: ptm[1].trim(),
                    py: ptm[2].trim(),
                    gloss: ptm[3].trim(),
                    role: ptm[4] ? ptm[4].trim().replace(/,$/, '') : 'other'
                });
            }
            var ptGrammar = [];
            var gramSec = fullText.match(/grammar\s*:\s*\n?([\s\S]+?)$/i);
            if (gramSec) {
                ptGrammar = gramSec[1].split('\n')
                    .map(function (l) { return l.trim().replace(/^[-•*]\s*/, ''); })
                    .filter(function (l) { return l && !/^hz\s*:/.test(l); });
            }
            return {
                literal: litMatch ? litMatch[1].trim().replace(/,\s*$/, '') : '',
                idiomatic: idiMatch ? idiMatch[1].trim().replace(/,\s*$/, '') : '',
                words: ptWords,
                grammar: ptGrammar
            };
        }
    } catch (e) { /* malformed provider output */ }
    return null;
}

function renderRawFallback(scroll, sentence, text, providerName) {
    let raw = text.trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
        .replace(/[{}[\]"]/g, '').trim();
    let lines = raw.split('\n').filter(function(l) { return l.trim(); });
    let html = '<div class="src-sentence">' + escapeHtml(sentence) + '</div>';
    html += '<div class="section-label">AI Analysis</div>';
    html += '<div class="grammar-notes"><ul>';
    lines.forEach(function(line) {
        let cleaned = line.trim().replace(/^[-,]/, '').trim();
        if (cleaned) html += '<li>' + escapeHtml(cleaned) + '</li>';
    });
    html += '</ul></div>';
    html += '<div class="ai-foot"><span>Raw response from ' + escapeHtml(providerName || 'AI') + ' (could not parse structured data)</span></div>';
    scroll.innerHTML = html;
}

function toneColorHanziNumbered(hanzi, numberedPinyin) {
    let syllables = numberedPinyin.split(/\s+/);
    let chars = hanzi.split('');
    let html = '';
    for (let i = 0; i < chars.length; i++) {
        let tone = 5;
        if (i < syllables.length) {
            let m = syllables[i].match(/[1-5]$/);
            if (m) tone = parseInt(m[0]);
        }
        html += '<span class="tone' + tone + '">' + escapeHtml(chars[i]) + '</span>';
    }
    return html;
}

function numberedToMarkPinyin(py) {
    return py.split(/\s+/).map(function (s) {
        let parsed = parse(s);
        if (parsed) {
            let t = tonify(parsed[2], parsed[4]);
            return parsed[1] + t[1] + parsed[3];
        }
        return s;
    }).join(' ');
}

function formatNumberedPinyin(py) {
    return py.split(/\s+/).map(function (s) {
        let parsed = parse(s);
        if (parsed) {
            let t = tonify(parsed[2], parsed[4]);
            let marked = parsed[1] + t[1] + parsed[3];
            return '<span class="tone' + parsed[4] + '">' + escapeHtml(marked) + '</span>';
        }
        let tone = toneFromMark(s);
        return '<span class="tone' + tone + '">' + escapeHtml(s) + '</span>';
    }).join(' ');
}

function toneFromMark(syllable) {
    if (/[āēīōūǖ]/.test(syllable)) return 1;
    if (/[áéíóúǘ]/.test(syllable)) return 2;
    if (/[ǎěǐǒǔǚ]/.test(syllable)) return 3;
    if (/[àèìòùǜ]/.test(syllable)) return 4;
    return 5;
}

function saveSentence(sentence, data, callback) {
    let pinyin = data.words ? data.words.map(function (w) { return w.py; }).join(' ') : '';
    let entry = {
        simplified: sentence,
        traditional: sentence,
        pinyin: pinyin,
        definition: data.idiomatic || '',
        notes: 'Literal: ' + (data.literal || ''),
        timestamp: Date.now(),
        isSentence: true,
        box: 1,
        breakdown: {
            literal: data.literal || '',
            idiomatic: data.idiomatic || '',
            words: data.words || [],
            grammar: data.grammar || []
        }
    };
    sendAddRequest({
        type: 'add', entries: [entry], list: document.title || document.location.hostname
    }, callback);
}

function closePanel() {
    let panel = document.getElementById('zhongwen-panel');
    if (panel) {
        panel.classList.remove('is-open');
    }
    invalidatePanelSession();
}

// ── Character Detail Panel (stroke order, decomposition, etymology) ───
//
// Fully offline: stroke data from hanzi-writer-data (MIT) and decomposition /
// etymology from Make Me a Hanzi (LGPL-3.0 / Arphic), merged at build time
// into data/chardata/<codepoint>.json. See tools/build-chardata.js.

let charWriters = [];

function charCodepoint(ch) {
    return ch.codePointAt(0).toString(16);
}

function fetchCharData(cp) {
    return fetch(chrome.runtime.getURL('data/chardata/' + cp + '.json'))
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
}

function formatEtymology(e) {
    if (!e) return '';
    if (e.type === 'pictophonetic') {
        let parts = [];
        if (e.semantic) {
            parts.push('semantic <span class="cz-comp">' + e.semantic + '</span>' +
                (e.hint ? ' (' + e.hint + ')' : ''));
        }
        if (e.phonetic) {
            parts.push('phonetic <span class="cz-comp">' + e.phonetic + '</span>');
        }
        return 'Picto-phonetic — ' + parts.join(' + ');
    }
    let label = e.type ? (e.type.charAt(0).toUpperCase() + e.type.slice(1)) : 'Origin';
    return label + (e.hint ? ' — ' + e.hint : '');
}

// Build an ordered, de-duplicated list of { ch, role } for the word's
// characters. CEDICT keeps simplified and traditional character-aligned, so
// we compare position by position: identical characters are labelled 'both',
// differing ones produce a 'simplified' and a 'traditional' card.
function charsWithForms(simplified, traditional) {
    simplified = simplified || '';
    traditional = traditional || simplified;
    let seen = {};
    let items = [];

    function push(ch, role) {
        if (!/\p{Script=Han}/u.test(ch)) return;
        let key = charCodepoint(ch) + ':' + role;
        if (seen[key]) return;
        seen[key] = true;
        items.push({ ch: ch, role: role });
    }

    let simp = [...simplified];
    let trad = [...traditional];
    if (simp.length === trad.length) {
        for (let i = 0; i < simp.length; i++) {
            if (simp[i] === trad[i]) {
                push(simp[i], 'both');
            } else {
                push(simp[i], 'simplified');
                push(trad[i], 'traditional');
            }
        }
    } else {
        // Lengths differ (rare) — fall back to listing every character once.
        simp.concat(trad).forEach(ch => push(ch, 'both'));
    }
    return items;
}

function roleLabel(role) {
    if (role === 'simplified') return 'Simplified';
    if (role === 'traditional') return 'Traditional';
    return 'Both';
}

function openCharPanel(simplified, traditional) {
    let items = charsWithForms(simplified, traditional);
    if (!items.length) return;
    let word = items.map(it => it.role.charAt(0) + it.ch).join('');
    let generation = beginPanelSession('character', word);
    if (generation === null) return;

    // Tear down any writers from a previous open.
    charWriters = [];

    let panel = createPanel();
    panel.setAttribute('data-direction', config.direction || 'vellum');
    panel.setAttribute('data-mode', config.mode || 'light');
    let title = document.getElementById('zhongwen-panel-title');
    if (title) title.textContent = 'Character Detail';
    let scroll = document.getElementById('zhongwen-panel-scroll');

    let cards = '';
    items.forEach(function (it, i) {
        cards +=
            '<div class="cz-char-card">' +
                '<div class="cz-stroke" id="cz-stroke-' + i + '">' +
                    '<span class="cz-stroke-fallback">' + it.ch + '</span>' +
                '</div>' +
                '<div class="cz-char-info">' +
                    '<button class="cz-replay" data-key="' + i + '" title="Replay strokes">↻</button>' +
                    '<span class="cz-role cz-role-' + it.role + '">' + roleLabel(it.role) + '</span>' +
                    '<div class="cz-char-py" id="cz-py-' + i + '"></div>' +
                    '<div class="cz-char-def" id="cz-def-' + i + '"></div>' +
                    '<dl class="cz-char-meta" id="cz-meta-' + i + '"></dl>' +
                    '<div class="cz-char-note" id="cz-note-' + i + '"></div>' +
                '</div>' +
            '</div>';
    });
    scroll.innerHTML = '<div class="cz-chardetail">' + cards + '</div>';

    requestAnimationFrame(function () {
        if (isCurrentPanelSession(generation)) panel.classList.add('is-open');
    });

    // Theme-aware stroke colours pulled from the panel's computed styles.
    let cs = getComputedStyle(scroll);
    let ink = cs.color || '#222';
    let accent = (cs.getPropertyValue('--tone-1') || '').trim() || '#c0392b';
    let colors = { ink: ink, accent: accent, outline: 'rgba(128,128,128,0.28)' };

    items.forEach(function (it, i) {
        fetchCharData(charCodepoint(it.ch)).then(function (data) {
            if (isCurrentPanelSession(generation)) renderCharCard(it.ch, i, data, colors);
        });
    });

    // Replay buttons.
    scroll.querySelectorAll('.cz-replay').forEach(function (btn) {
        btn.addEventListener('click', function () {
            let w = charWriters[btn.getAttribute('data-key')];
            if (w) w.animateCharacter();
        });
    });
}

function renderCharCard(ch, key, data, colors) {
    let target = document.getElementById('cz-stroke-' + key);
    let meta = document.getElementById('cz-meta-' + key);
    if (!target) return;

    if (!data || !data.strokes) {
        // No offline data for this character — leave the plain glyph fallback.
        return;
    }

    // Stroke-order animation.
    if (typeof HanziWriter !== 'undefined') {
        target.innerHTML = '';
        try {
            let writer = HanziWriter.create(target, ch, {
                width: 96,
                height: 96,
                padding: 4,
                showCharacter: false,
                showOutline: true,
                strokeColor: colors.ink,
                radicalColor: colors.accent,
                outlineColor: colors.outline,
                delayBetweenStrokes: 180,
                strokeAnimationSpeed: 1,
                charDataLoader: function () { return data; }
            });
            writer.loopCharacterAnimation();
            charWriters[key] = writer;
        } catch (e) {
            // Leave the fallback glyph in place if rendering fails.
        }
    }

    // Pinyin + definition.
    if (data.pinyin && data.pinyin.length) {
        let py = document.getElementById('cz-py-' + key);
        if (py) py.textContent = data.pinyin.join(', ');
    }
    if (data.definition) {
        let def = document.getElementById('cz-def-' + key);
        if (def) def.textContent = data.definition;
    }

    // Radical / components / etymology.
    if (!meta) return;
    let rows = '';
    if (data.radical) {
        rows += '<div><dt>Radical</dt><dd><span class="cz-comp">' + data.radical + '</span></dd></div>';
    }
    if (data.decomposition && data.decomposition !== ch) {
        // Strip Ideographic Description Characters (⿰⿱…, U+2FF0–U+2FFF), which
        // most fonts render as "tofu"; show just the component glyphs.
        let comps = data.decomposition.replace(/[⿰-⿿]/g, '');
        if (comps) {
            rows += '<div><dt>Components</dt><dd class="cz-decomp">' + comps + '</dd></div>';
        }
    }
    let etym = formatEtymology(data.etymology);
    if (etym) {
        rows += '<div><dt>Origin</dt><dd>' + etym + '</dd></div>';
    }
    meta.innerHTML = rows;

    // When a component has no Unicode character (shown as "?" in the data),
    // explain it and link out to sites that render the full breakdown.
    let note = document.getElementById('cz-note-' + key);
    if (note && data.decomposition && /[?？]/.test(data.decomposition)) {
        let q = encodeURIComponent(ch);
        note.innerHTML =
            '<span class="cz-note-mark">？</span> = a sub-component with no Unicode ' +
            'character, so it can’t be shown as text. See the full breakdown on ' +
            '<a href="https://www.yellowbridge.com/chinese/character-etymology.php?zi=' + q +
            '" target="_blank" rel="noreferrer noopener">YellowBridge</a> or ' +
            '<a href="https://zi.tools/zi/' + q +
            '" target="_blank" rel="noreferrer noopener">zi.tools</a>.';
    }
}

// ── Thesaurus Panel (synonyms) ───────────────────────────────────────
//
// Offline synonyms come from the Chinese Open Wordnet (CC BY 3.0) via the
// background script. When a word isn't covered, we link out to an online
// thesaurus instead (hybrid, offline-first).

function openThesaurusPanel(simplified, traditional) {
    let word = simplified || traditional;
    if (!word) return;
    let generation = beginPanelSession('thesaurus', word);
    if (generation === null) return;

    let panel = createPanel();
    panel.setAttribute('data-direction', config.direction || 'vellum');
    panel.setAttribute('data-mode', config.mode || 'light');
    let title = document.getElementById('zhongwen-panel-title');
    if (title) title.textContent = 'Thesaurus';
    let scroll = document.getElementById('zhongwen-panel-scroll');

    scroll.innerHTML =
        '<div class="cz-thes-head"><span class="cz-thes-word">' + word + '</span></div>' +
        '<div class="ai-status" id="zhongwen-thes-status">' +
            '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
            '<span>Looking up synonyms…</span>' +
        '</div>';

    requestAnimationFrame(function () {
        if (isCurrentPanelSession(generation)) panel.classList.add('is-open');
    });

    chrome.runtime.sendMessage({
        type: 'thesaurus',
        simplified: simplified,
        traditional: traditional
    }, function (response) {
        if (!isCurrentPanelSession(generation)) return;
        let synonyms = (response && response.synonyms) || [];
        renderThesaurus(word, synonyms);
    });
}

// Links to online thesauruses for a word, joined by `sep`.
function thesaurusLinks(word, sep) {
    let q = encodeURIComponent(word);
    let baidu = '<a href="https://hanyu.baidu.com/s?wd=' + q +
        '" target="_blank" rel="noreferrer noopener">Baidu Hanyu</a>';
    let zdic = '<a href="https://www.zdic.net/hans/' + q +
        '" target="_blank" rel="noreferrer noopener">Zdic</a>';
    return baidu + sep + zdic;
}

function renderThesaurus(word, synonyms) {
    let scroll = document.getElementById('zhongwen-panel-scroll');
    if (!scroll) return;

    let html = '<div class="cz-thes-head"><span class="cz-thes-word">' + word + '</span></div>';

    if (synonyms.length) {
        html += '<div class="cz-thes-chips">';
        for (let s of synonyms) {
            html += '<span class="cz-thes-chip">' + s + '</span>';
        }
        html += '</div>';
        html += '<div class="cz-thes-hint">Hover a word above for its definition.</div>';
        // Offline data is partial, so always offer fuller online sources.
        html += '<div class="cz-thes-more">More synonyms: ' + thesaurusLinks(word, ' · ') + '</div>';
        html += '<div class="cz-thes-credit">Offline synonyms from the ' +
            '<a href="https://bond-lab.github.io/cow/" target="_blank" rel="noreferrer noopener">' +
            'Chinese Open Wordnet</a> (CC BY 3.0).</div>';
    } else {
        html += '<div class="cz-thes-empty">No offline synonyms found for ' +
            '<span class="cz-thes-word-sm">' + word + '</span>. Look it up on ' +
            thesaurusLinks(word, ' or ') + '.</div>';
    }

    scroll.innerHTML = html;
}

function saveEntry(index) {
    if (index < 0 || index >= savedSearchResults.length) return;
    let r = savedSearchResults[index];
    sendAddRequest({
        'type': 'add',
        'entries': [{
            simplified: r[0],
            traditional: r[1],
            pinyin: r[2],
            definition: r[3]
        }],
        'list': document.title || document.location.hostname
    }, function (error) {
        if (error) {
            showPopup('<div class="cz-msg">Could not save: ' + escapeHtml(error) + '</div>', null, -1, -1);
            return;
        }
        let msg;
        if (savedSearchResults.length === 1) {
            msg = 'Saved to word list.';
        } else {
            msg = 'Saved #' + (index + 1) + ' to word list.';
        }
        msg += '<br><kbd>Alt+W</kbd> to open word list.';
        showPopup('<div class="cz-msg">' + msg + '</div>', null, -1, -1);
    });
}

function sendAddRequest(request, callback) {
    chrome.runtime.sendMessage(request, function (response) {
        let error = chrome.runtime.lastError && chrome.runtime.lastError.message;
        if (!error && (!response || response.error)) {
            error = response && response.error || 'No response from background service.';
        }
        callback(error || null);
    });
}

function saveDisplayedEntries(forceAll) {
    if (!savedSearchResults.length) return;
    let all = [];
    for (let result of savedSearchResults) {
        all.push({
            simplified: result[0],
            traditional: result[1],
            pinyin: result[2],
            definition: result[3]
        });
    }
    sendAddRequest({
        type: 'add',
        entries: all,
        list: document.title || document.location.hostname,
        saveMode: forceAll ? 'all' : 'preference'
    }, function (error) {
        if (error) {
            showPopup('<div class="cz-msg">Could not save: ' + escapeHtml(error) + '</div>', null, -1, -1);
            return;
        }
        showPopup(
            '<div class="cz-msg">Saved to word list.<br><kbd>Alt+W</kbd> to open word list.</div>',
            null, -1, -1
        );
    });
}

function buildSkritterAddUrl(result, tld) {
    let skritter = tld === 'cn' ? 'https://skritter.cn' : 'https://skritter.com';
    return skritter +
        '/vocab/api/add?from=zhongwen&ref=zhongwen&lang=zh&word=' +
        encodeURIComponent(result[0]) +
        '&trad=' + encodeURIComponent(result[1]) +
        '&rdng=' + encodeURIComponent(result[4]) +
        '&defn=' + encodeURIComponent(result[3]);
}

function onKeyDown(keyDown) {

    if (!keyDown.isTrusted) {
        return;
    }

    if (keyDown.ctrlKey || keyDown.metaKey) {
        return;
    }

    if (keyDown.keyCode === 27) {
        if (panelOpen) {
            closePanel();
            return;
        }
        hidePopup();
        return;
    }

    if (keyDown.altKey && keyDown.keyCode === 87) {
        // Alt + w
        chrome.runtime.sendMessage({
            type: 'open',
            tabType: 'wordlist',
            url: '/wordlist.html'
        });
        return;
    }

    let target = keyDown.target;
    let isEditable = target && (
        target.matches && target.matches('input, textarea, select') || target.isContentEditable
    );
    let isExplicitEditableShortcut = keyDown.altKey &&
        keyDown.keyCode >= 49 && keyDown.keyCode <= 55;
    if (isEditable && !isExplicitEditableShortcut) {
        return;
    }

    if (!isVisible()) {
        return;
    }

    switch (keyDown.keyCode) {

        case 65: // 'a'
            altView = (altView + 1) % 3;
            triggerSearch();
            break;

        case 67: // 'c'
            copyToClipboard(getTextForClipboard());
            break;

        case 68: // 'd' — compact view: enter it, then cycle meanings (Shift+D goes back)
            if (!popupShowsResult) break;   // ignore when the popup is a message/help, not an entry
            userToggledView = true;
            if (!compactView) {
                compactView = true;
                compactPos = 0;
            } else if (compactFlat.length > 0) {
                compactPos = keyDown.shiftKey
                    ? (compactPos - 1 + compactFlat.length) % compactFlat.length
                    : (compactPos + 1) % compactFlat.length;
            }
            rerenderPopup();
            break;

        case 70: // 'f' — return to the full view from compact
            if (!popupShowsResult) break;
            if (compactView) {
                userToggledView = true;
                compactView = false;
                rerenderPopup();
            }
            break;

        case 191: // '?' / '/' — toggle the shortcut hints (both keys, Shift optional)
            if (!popupShowsResult) break;
            showKeys = !showKeys;
            rerenderPopup();
            break;

        case 69: // 'e' — character detail: stroke order, decomposition, etymology
            if (savedSearchResults.length > 0) {
                openCharPanel(savedSearchResults[0][0], savedSearchResults[0][1]);
            }
            break;

        case 76: // 'l' — thesaurus: synonyms (offline, with link fallback)
            if (savedSearchResults.length > 0) {
                openThesaurusPanel(savedSearchResults[0][0], savedSearchResults[0][1]);
            }
            break;

        case 66: // 'b'
        {
            let offset = selStartDelta;
            for (let i = 0; i < 10; i++) {
                selStartDelta = --offset;
                let ret = triggerSearch();
                if (ret === 0) {
                    break;
                } else if (ret === 2) {
                    savedRangeNode = findPreviousTextNode(savedRangeNode.parentNode, savedRangeNode);
                    savedRangeOffset = 0;
                    offset = savedRangeNode.data.length;
                }
            }
        }
            break;

        case 71: // 'g'
            if (config.grammar !== 'no' && savedSearchResults.grammar) {
                let sel = encodeURIComponent(window.getSelection().toString());

                // https://resources.allsetlearning.com/chinese/grammar/%E4%B8%AA
                let allset = 'https://resources.allsetlearning.com/chinese/grammar/' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'grammar',
                    url: allset
                });
            }
            break;

        case 77: // 'm'
            selStartIncrement = 1;
        // falls through
        case 78: // 'n'
            for (let i = 0; i < 10; i++) {
                selStartDelta += selStartIncrement;
                let ret = triggerSearch();
                if (ret === 0) {
                    break;
                } else if (ret === 2) {
                    savedRangeNode = findNextTextNode(savedRangeNode.parentNode, savedRangeNode);
                    savedRangeOffset = 0;
                    selStartDelta = 0;
                    selStartIncrement = 0;
                }
            }
            break;

        case 82: // 'r'
            if (keyDown.shiftKey && savedSearchResults.length > 0) {
                saveDisplayedEntries(true);
            } else {
                saveDisplayedEntries(false);
            }
            break;

        case 83: // 's'
            if (keyDown.shiftKey) {
                // Shift+S: Skritter
                let skritter = buildSkritterAddUrl(savedSearchResults[0], config.skritterTLD);
                chrome.runtime.sendMessage({ type: 'open', tabType: 'skritter', url: skritter });
            } else {
                // S: Sentence breakdown
                let sentence = getSurroundingSentence();
                if (sentence) {
                    openPanel(sentence);
                }
            }
            break;

        case 84: // 't'
            {
                let sel = encodeURIComponent(
                    window.getSelection().toString());

                // https://tatoeba.org/eng/sentences/search?from=cmn&to=eng&query=%E8%BF%9B%E8%A1%8C
                let tatoeba = 'https://tatoeba.org/eng/sentences/search?from=cmn&to=eng&query=' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'tatoeba',
                    url: tatoeba
                });
            }
            break;

        case 86: // 'v'
            if (config.vocab !== 'no' && savedSearchResults.vocab) {
                let sel = encodeURIComponent(window.getSelection().toString());

                // https://resources.allsetlearning.com/chinese/vocabulary/%E4%B8%AA
                let allset = 'https://resources.allsetlearning.com/chinese/vocabulary/' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'vocab',
                    url: allset
                });
            }
            break;

        case 88: // 'x' — nudge popup up
            altView = 0;
            popYOffset -= 20;
            triggerSearch();
            break;

        case 89: // 'y' — nudge popup down
            altView = 0;
            popYOffset += 20;
            triggerSearch();
            break;

        case 49: // '1'
            if (keyDown.altKey) {
                let simp = savedSearchResults[0][0];
                let linedict = 'https://english.dict.naver.com/english-chinese-dictionary/#/search?query=' +
                    encodeURIComponent(simp);
                chrome.runtime.sendMessage({ type: 'open', tabType: 'linedict', url: linedict });
            } else if (savedSearchResults.length > 1) {
                saveEntry(0);
            }
            break;

        case 50: // '2'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(window.getSelection().toString());
                let forvo = 'https://forvo.com/search/' + sel + '/zh/';
                chrome.runtime.sendMessage({ type: 'open', tabType: 'forvo', url: forvo });
            } else if (savedSearchResults.length > 1) {
                saveEntry(1);
            }
            break;

        case 51: // '3'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(window.getSelection().toString());
                let dictcn = 'https://dict.cn/' + sel;
                chrome.runtime.sendMessage({ type: 'open', tabType: 'dictcn', url: dictcn });
            } else if (savedSearchResults.length > 2) {
                saveEntry(2);
            }
            break;

        case 52: // '4'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(window.getSelection().toString());
                let iciba = 'https://www.iciba.com/' + sel;
                chrome.runtime.sendMessage({ type: 'open', tabType: 'iciba', url: iciba });
            } else if (savedSearchResults.length > 3) {
                saveEntry(3);
            }
            break;

        case 53: // '5'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(window.getSelection().toString());
                let mdbg = 'https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=' + sel;
                chrome.runtime.sendMessage({ type: 'open', tabType: 'mdbg', url: mdbg });
            } else if (savedSearchResults.length > 4) {
                saveEntry(4);
            }
            break;

        case 54: // '6'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(window.getSelection().toString());
                let reverso = 'https://context.reverso.net/translation/chinese-english/' + sel;
                chrome.runtime.sendMessage({ type: 'open', tabType: 'reverso', url: reverso });
            } else if (savedSearchResults.length > 5) {
                saveEntry(5);
            }
            break;

        case 55: // '7'
            if (keyDown.altKey) {
                let trad = savedSearchResults[0][1];
                let moedict = 'https://www.moedict.tw/~' + encodeURIComponent(trad);
                chrome.runtime.sendMessage({ type: 'open', tabType: 'moedict', url: moedict });
            } else if (savedSearchResults.length > 6) {
                saveEntry(6);
            }
            break;

        case 56: // '8'
            if (!keyDown.altKey && savedSearchResults.length > 7) {
                saveEntry(7);
            }
            break;

        case 57: // '9'
            if (!keyDown.altKey && savedSearchResults.length > 8) {
                saveEntry(8);
            }
            break;

        default:
            return;
    }
}

function onMouseMove(mouseMove) {
    if (!mouseMove.isTrusted) {
        return;
    }

    if (mouseMove.target.nodeName === 'TEXTAREA' || mouseMove.target.nodeName === 'INPUT'
        || mouseMove.target.nodeName === 'DIV') {

        let div = document.getElementById('zhongwenDiv');

        if (mouseMove.altKey) {

            if (!div && (mouseMove.target.nodeName === 'TEXTAREA' || mouseMove.target.nodeName === 'INPUT')) {

                div = makeDiv(mouseMove.target);
                document.body.appendChild(div);
                div.scrollTop = mouseMove.target.scrollTop;
                div.scrollLeft = mouseMove.target.scrollLeft;
            }
        } else {
            if (div) {
                document.body.removeChild(div);
            }
        }
    }

    if (clientX && clientY) {
        if (mouseMove.clientX === clientX && mouseMove.clientY === clientY) {
            return;
        }
    }
    clientX = mouseMove.clientX;
    clientY = mouseMove.clientY;

    let range;
    let rangeNode;
    let rangeOffset;

    // Handle Chrome and Firefox
    if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(mouseMove.clientX, mouseMove.clientY);
        if (range === null) {
            return;
        }
        rangeNode = range.startContainer;
        rangeOffset = range.startOffset;
    } else if (document.caretPositionFromPoint) {
        range = document.caretPositionFromPoint(mouseMove.clientX, mouseMove.clientY);
        if (range === null) {
            return;
        }
        rangeNode = range.offsetNode;
        rangeOffset = range.offset;
    }

    if (mouseMove.target === savedTarget) {
        if (rangeNode === savedRangeNode && rangeOffset === savedRangeOffset) {
            return;
        }
    }

    if (timer) {
        clearTimeout(timer);
        timer = null;
    }

    if (rangeNode.data && rangeOffset === rangeNode.data.length) {
        rangeNode = findNextTextNode(rangeNode.parentNode, rangeNode);
        rangeOffset = 0;
    }

    if (!rangeNode || rangeNode.parentNode !== mouseMove.target) {
        rangeNode = null;
        rangeOffset = -1;
    }

    savedTarget = mouseMove.target;
    savedRangeNode = rangeNode;
    savedRangeOffset = rangeOffset;

    selStartDelta = 0;
    selStartIncrement = 1;

    if (rangeNode && rangeNode.data && rangeOffset < rangeNode.data.length) {
        popX = mouseMove.clientX;
        popY = mouseMove.clientY;
        popYOffset = 0;   // new hover clears any X/Y nudge from the previous word
        timer = setTimeout(() => triggerSearch(), 50);
        return;
    }

    // Don't close just because we moved from a valid pop-up slightly over to a place with nothing.
    let dx = popX - mouseMove.clientX;
    let dy = popY - mouseMove.clientY;
    let distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 4) {
        clearHighlight();
        hidePopup();
    }
}

function triggerSearch() {

    let rangeNode = savedRangeNode;
    let selStartOffset = savedRangeOffset + selStartDelta;

    selStartIncrement = 1;

    if (!rangeNode) {
        clearHighlight();
        hidePopup();
        return 1;
    }

    if (selStartOffset < 0 || rangeNode.data.length <= selStartOffset) {
        clearHighlight();
        hidePopup();
        return 2;
    }

    let u = rangeNode.data.charCodeAt(selStartOffset);

    let isChineseCharacter = !isNaN(u) && (
        u === 0x25CB ||
        (0x3400 <= u && u <= 0x9FFF) ||
        (0xF900 <= u && u <= 0xFAFF) ||
        (0xFF21 <= u && u <= 0xFF3A) ||
        (0xFF41 <= u && u <= 0xFF5A) ||
        (0xD800 <= u && u <= 0xDFFF)
    );

    if (!isChineseCharacter) {
        clearHighlight();
        hidePopup();
        return 3;
    }

    let selEndList = [];
    let originalText = getText(rangeNode, selStartOffset, selEndList, 30 /*maxlength*/);

    // Workaround for Google Docs: remove zero-width non-joiner &zwnj;
    let text = originalText.replace(zwnj, '');

    savedSelStartOffset = selStartOffset;
    savedSelEndList = selEndList;

    chrome.runtime.sendMessage({
            'type': 'search',
            'text': text,
            'originalText': originalText
        },
        processSearchResult
    );

    return 0;
}

function processSearchResult(result) {

    let selStartOffset = savedSelStartOffset;
    let selEndList = savedSelEndList;

    if (!result) {
        hidePopup();
        clearHighlight();
        return;
    }

    wordRect = null;   // recomputed by highlightMatch below; stays null inside form fields

    let highlightLength;
    let index = 0;
    for (let i = 0; i < result.matchLen; i++) {
        // Google Docs workaround: determine the correct highlight length
        while (result.originalText[index] === '\u200c') {
            index++;
        }
        index++;
    }
    highlightLength = index;

    selStartIncrement = result.matchLen;
    selStartDelta = (selStartOffset - savedRangeOffset);

    let rangeNode = savedRangeNode;
    // don't try to highlight form elements
    if (!('form' in savedTarget)) {
        let doc = rangeNode.ownerDocument;
        if (!doc) {
            clearHighlight();
            hidePopup();
            return;
        }
        highlightMatch(doc, rangeNode, selStartOffset, highlightLength, selEndList);
    }

    // Reset the meaning cycle only on a genuinely new word — not when the same
    // word is re-shown by a positioning key (A/X/Y), which also re-runs the search.
    let resultKey = (result.data && result.data.length) ? result.data[0][0] : '';
    if (resultKey !== lastResultKey) {
        compactPos = 0;
        lastResultKey = resultKey;
    }

    parseResult(result, config.tonecolors !== 'no');
    showPopup(renderEntries(), savedTarget, popX, popY);
    popupShowsResult = true;
}

// Re-render the open popup in place — used when cycling/toggling the compact view
// or the shortcut hints. Re-parses nothing (reuses lastEntries) and re-runs the
// placement so a height change (compact↔full, hints on/off) can't strand or clip it.
function rerenderPopup() {
    let popup = document.getElementById('zhongwen-window');
    if (!popup || !popupShowsResult || !lastEntries.length) return;
    popup.innerHTML = renderEntries();
    placePopup(popup, savedTarget);
}

// modifies selEndList as a side-effect
function getText(startNode, offset, selEndList, maxLength) {
    let text = '';
    let endIndex;

    if (startNode.nodeType !== Node.TEXT_NODE) {
        return '';
    }

    endIndex = Math.min(startNode.data.length, offset + maxLength);
    text += startNode.data.substring(offset, endIndex);
    selEndList.push({
        node: startNode,
        offset: endIndex
    });

    let nextNode = startNode;
    while ((text.length < maxLength) && ((nextNode = findNextTextNode(nextNode.parentNode, nextNode)) !== null)) {
        text += getTextFromSingleNode(nextNode, selEndList, maxLength - text.length);
    }

    return text;
}

// modifies selEndList as a side-effect
function getTextFromSingleNode(node, selEndList, maxLength) {
    let endIndex;

    if (node.nodeName === '#text') {
        endIndex = Math.min(maxLength, node.data.length);
        selEndList.push({
            node: node,
            offset: endIndex
        });
        return node.data.substring(0, endIndex);
    } else {
        return '';
    }
}

function showPopup(html, elem, x, y) {

    if (!x || !y) {
        x = y = 0;
    }

    // A bare showPopup shows a message/help; processSearchResult sets this true
    // afterwards for real entries. Gates the D/F/? keys (see onKeyDown).
    popupShowsResult = false;

    let popup = document.getElementById('zhongwen-window');

    if (!popup) {
        popup = document.createElement('div');
        popup.setAttribute('id', 'zhongwen-window');
        document.documentElement.appendChild(popup);
    }

    popup.className = 'cz-popup';
    popup.setAttribute('data-direction', config.direction || 'vellum');
    popup.setAttribute('data-mode', config.mode || 'light');
    popup.setAttribute('data-density', config.density || 'regular');
    popup.setAttribute('data-hanzi-font', config.hanziFont || 'serif');
    let scale = parseFloat(config.popupScale);
    if (isNaN(scale) || scale <= 0) scale = 1;
    popup.style.zoom = scale !== 1 ? scale : '';

    if (config.tonecolors === 'no') {
        popup.setAttribute('data-tone-scheme', 'none');
    } else if (config.toneColorScheme && config.toneColorScheme !== 'signature') {
        popup.setAttribute('data-tone-scheme', config.toneColorScheme);
    } else {
        popup.removeAttribute('data-tone-scheme');
    }

    popup.innerHTML = html;

    if (elem) {
        popup.classList.remove('is-visible');
        popup.style.display = '';
        placePopup(popup, elem);
    } else if (x !== -1 && y !== -1) {
        popup.style.left = (x / scale) + 'px';
        popup.style.top = (y / scale) + 'px';
    }

    popup.style.display = '';
    popup.offsetHeight;
    popup.classList.add('is-visible');
}

// Measure the (already-populated) popup and set its left/top. Shared by the
// initial show and by rerenderPopup so re-rendered content is always re-placed
// with the same edge-aware logic. Anchors to the highlighted word when possible.
function placePopup(popup, elem) {
    let scale = parseFloat(config.popupScale);
    if (isNaN(scale) || scale <= 0) scale = 1;

    popup.style.left = '0px';
    popup.style.top = '-9999px';

    let pW = popup.offsetWidth;
    let pH = popup.offsetHeight;
    if (pW <= 0) pW = 240;
    if (pH <= 0) pH = 80;

    let x, y;
    if (altView === 1) {
        x = 0;
        y = 0;
    } else if (altView === 2) {
        x = window.innerWidth - pW - 20;
        y = window.innerHeight - pH - 20;
    } else if (elem instanceof window.HTMLOptionElement) {
        let rect = elem.parentNode.getBoundingClientRect();
        x = rect.right + 5;
        y = rect.top;
        if (x + pW > window.innerWidth) {
            x = rect.left - pW - 5;
        }
        y += popYOffset;
    } else if (wordRect) {
        // Anchor to the highlighted word so the gap is consistent and the
        // popup follows the word during keyboard navigation, not the mouse.
        let gap = 8;
        x = wordRect.left;
        let below = wordRect.bottom + gap;
        let above = wordRect.top - gap - pH;
        // Prefer below; flip above only when below overflows and above fits.
        y = (below + pH > window.innerHeight && above >= 0) ? above : below;
        y += popYOffset;
    } else {
        // Fallback (e.g. form fields): anchor to the mouse cursor.
        x = popX;
        y = popY;
        let v = 25;
        if (y + v + pH > window.innerHeight) {
            let t = y - pH - 30;
            if (t >= 0) y = t;
        } else {
            y += v;
        }
        y += popYOffset;
    }

    // Keep the popup on screen on both axes (covers tall popups and X/Y nudges).
    if (x + pW > window.innerWidth - 20) x = window.innerWidth - pW - 20;
    if (x < 0) x = 0;
    if (y + pH > window.innerHeight - 8) y = window.innerHeight - pH - 8;
    if (y < 0) y = 0;

    popup.style.left = (x / scale) + 'px';
    popup.style.top = (y / scale) + 'px';
}

function hidePopup() {
    let popup = document.getElementById('zhongwen-window');
    if (popup) {
        popup.classList.remove('is-visible');
        popup.style.display = 'none';
        popup.innerHTML = '';
    }
}

function highlightMatch(doc, rangeStartNode, rangeStartOffset, matchLen, selEndList) {
    if (!selEndList || selEndList.length === 0) return;

    let selEnd;
    let offset = rangeStartOffset + matchLen;

    for (let i = 0, len = selEndList.length; i < len; i++) {
        selEnd = selEndList[i];
        if (offset <= selEnd.offset) {
            break;
        }
        offset -= selEnd.offset;
    }

    let range = doc.createRange();
    range.setStart(rangeStartNode, rangeStartOffset);
    range.setEnd(selEnd.node, offset);

    let sel = window.getSelection();
    if (!sel.isCollapsed && selText !== sel.toString())
        return;
    sel.empty();
    sel.addRange(range);
    selText = sel.toString();

    // Anchor point for the popup: the on-screen box of the highlighted word.
    // Use the first line box so a word that wraps doesn't yield a tall union rect.
    let rects = range.getClientRects();
    let r = (rects && rects.length) ? rects[0] : range.getBoundingClientRect();
    wordRect = (r && (r.width || r.height)) ? r : null;
}

function clearHighlight() {

    if (selText === null) {
        return;
    }

    let selection = window.getSelection();
    if (selection.isCollapsed || selText === selection.toString()) {
        selection.empty();
    }
    selText = null;
}

function isVisible() {
    let popup = document.getElementById('zhongwen-window');
    return popup && popup.classList.contains('is-visible');
}

function getTextForClipboard() {
    let result = '';
    for (let i = 0; i < savedSearchResults.length; i++) {
        result += savedSearchResults[i].slice(0, -1).join('\t');
        result += '\n';
    }
    return result;
}

function makeDiv(input) {
    let div = document.createElement('div');

    div.id = 'zhongwenDiv';

    let text;
    if (input.value) {
        text = input.value;
    } else {
        text = '';
    }
    div.innerText = text;

    div.style.cssText = window.getComputedStyle(input, '').cssText;
    div.scrollTop = input.scrollTop;
    div.scrollLeft = input.scrollLeft;
    div.style.position = 'absolute';
    div.style.zIndex = 7000;
    $(div).offset({
        top: $(input).offset().top,
        left: $(input).offset().left
    });

    return div;
}

function findNextTextNode(root, previous) {
    if (root === null) {
        return null;
    }
    let nodeIterator = document.createNodeIterator(root, NodeFilter.SHOW_TEXT, null);
    let node = nodeIterator.nextNode();
    while (node !== previous) {
        node = nodeIterator.nextNode();
        if (node === null) {
            return findNextTextNode(root.parentNode, previous);
        }
    }
    let result = nodeIterator.nextNode();
    if (result !== null) {
        return result;
    } else {
        return findNextTextNode(root.parentNode, previous);
    }
}

function findPreviousTextNode(root, previous) {
    if (root === null) {
        return null;
    }
    let nodeIterator = document.createNodeIterator(root, NodeFilter.SHOW_TEXT, null);
    let node = nodeIterator.nextNode();
    while (node !== previous) {
        node = nodeIterator.nextNode();
        if (node === null) {
            return findPreviousTextNode(root.parentNode, previous);
        }
    }
    nodeIterator.previousNode();
    let result = nodeIterator.previousNode();
    if (result !== null) {
        return result;
    } else {
        return findPreviousTextNode(root.parentNode, previous);
    }
}

function copyToClipboard(data) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(data).catch(() => {});
    } else {
        let txt = document.createElement('textarea');
        txt.style.position = 'absolute';
        txt.style.left = '-100%';
        txt.value = data;
        document.body.appendChild(txt);
        txt.select();
        try { document.execCommand('copy'); } catch (e) { /* clipboard fallback unavailable */ }
        document.body.removeChild(txt);
    }

    showPopup('<div class="cz-msg">Copied to clipboard</div>', null, -1, -1);
}

function toneColorHanzi(hanzi, pinyinStr, showToneColors) {
    if (!showToneColors) return hanzi;
    let syllables = pinyinStr.split(/[\s·]+/).filter(s => s !== ',');
    let chars = hanzi.split('');
    let html = '';
    for (let i = 0; i < chars.length; i++) {
        let tone = 5;
        if (i < syllables.length) {
            let m = syllables[i].match(/[1-5]$/);
            if (m) tone = parseInt(m[0]);
        }
        html += '<span class="tone' + tone + '">' + chars[i] + '</span>';
    }
    return html;
}

// Parse a search result into per-entry render data ONCE, and publish the derived
// state (savedSearchResults, compactFlat, lastEntries) that callers depend on.
// Rendering is separate (renderEntries) so cycling/toggling doesn't re-parse.
function parseResult(result, showToneColors) {

    let entry;
    let texts = [];
    let entries = [];

    for (let i = 0; i < result.data.length; ++i) {
        entry = result.data[i][0].match(/^([^\s]+?)\s+([^\s]+?)\s+\[(.*?)\]?\s*\/(.+)\//);
        if (!entry) continue;

        let simplified = entry[2];
        let traditional = entry[1];
        let rawPinyin = entry[3];

        // Head (hanzi + pinyin + zhuyin) — identical markup for both views
        let headHtml = '<div class="head">';
        if (config.simpTrad === 'auto') {
            let word = result.data[i][1];
            headHtml += '<div class="hanzi">' + toneColorHanzi(word, rawPinyin, showToneColors) + '</div>';
        } else {
            headHtml += '<div class="hanzi">';
            headHtml += toneColorHanzi(simplified, rawPinyin, showToneColors);
            if (traditional !== simplified) {
                headHtml += '<span class="alt">' + toneColorHanzi(traditional, rawPinyin, showToneColors) + '</span>';
            }
            headHtml += '</div>';
        }
        let p = pinyinAndZhuyin(rawPinyin, showToneColors);
        headHtml += '<div class="pinyin">' + p[0] + '</div>';
        if (config.zhuyin === 'yes') {
            headHtml += '<span class="zhuyin">' + p[2] + '</span>';
        }
        headHtml += '</div>'; // .head

        // Senses: CEDICT '/'-separated, ordered most-common first
        let senses = entry[4].split('/').map(s => s.trim()).filter(Boolean);
        let translation = senses.join('; ');

        entries.push({
            index: i,
            headHtml: headHtml,
            senses: senses,
            showGrammar: config.grammar !== 'no' && result.grammar && result.grammar.index === i,
            showVocab: config.vocab !== 'no' && result.vocab && result.vocab.index === i
        });

        texts[i] = [simplified, traditional, p[1], translation, rawPinyin];
    }

    savedSearchResults = texts;
    savedSearchResults.grammar = result.grammar;
    savedSearchResults.vocab = result.vocab;

    // Flat cycle order: all senses of entry 0, then all senses of entry 1, …
    compactFlat = [];
    entries.forEach((e, ei) => e.senses.forEach((s, si) => compactFlat.push([ei, si])));

    lastEntries = entries;
    lastMore = !!result.more;
}

// Render the current view (full or compact) from the already-parsed lastEntries.
function renderEntries() {
    let entries = lastEntries;
    if (!entries.length) return '';

    if (compactView && compactFlat.length > 0) {
        return renderCompact(entries);
    }

    let html = '';
    for (let k = 0; k < entries.length; k++) {
        let e = entries[k];
        html += '<div class="entry">';
        if (entries.length > 1) {
            html += '<span class="entry-num">' + (e.index + 1) + '</span>';
        }
        html += e.headHtml;
        html += '<p class="def">' + e.senses.join('; ') + '</p>';
        if (e.showGrammar) {
            html += '<div class="grammar">Press <kbd>G</kbd> for grammar and usage notes.</div>';
        }
        if (e.showVocab) {
            html += '<div class="grammar">Press <kbd>V</kbd> for vocabulary notes.</div>';
        }
        html += '</div>'; // .entry
    }

    if (lastMore) {
        html += '<div class="cz-msg">&hellip;</div>';
    }

    let items = [primarySaveHint(entries.length)];
    if (entries.length > 1) {
        items.push('<kbd>1</kbd>–<kbd>' + entries.length + '</kbd>save #');
        items.push('<kbd>Shift+R</kbd>save all');
    }
    items.push('<kbd>D</kbd>compact', '<kbd>S</kbd>breakdown', '<kbd>E</kbd>characters',
        '<kbd>L</kbd>thesaurus', '<kbd>C</kbd>copy', '<kbd>N</kbd>next word');
    html += keysRow(items);

    return html;
}

// Compact view: one meaning at a time. compactPos indexes into compactFlat,
// which steps through every sense of the first entry before moving to the next.
function renderCompact(entries) {
    let total = compactFlat.length;
    if (compactPos >= total) compactPos = 0;
    if (compactPos < 0) compactPos = total - 1;

    let pair = compactFlat[compactPos];
    let e = entries[pair[0]];
    let sense = e.senses[pair[1]];

    let html = '<div class="entry cz-compact">';
    html += e.headHtml;
    html += '<p class="def">' + sense + '</p>';
    html += '</div>';

    if (total > 1) {
        html += '<div class="cz-compact-more">'
            + '<span class="cz-compact-count">' + (compactPos + 1) + ' / ' + total + '</span>'
            + '<span><kbd>D</kbd> next meaning</span>'
            + '</div>';
    }

    html += keysRow([primarySaveHint(entries.length), '<kbd>F</kbd>full view', '<kbd>S</kbd>breakdown',
        '<kbd>E</kbd>characters', '<kbd>L</kbd>thesaurus', '<kbd>C</kbd>copy', '<kbd>N</kbd>next word']);

    return html;
}

function primarySaveHint(entryCount) {
    if (entryCount <= 1) return '<kbd>R</kbd>save';
    return config.saveToWordList === 'firstEntryOnly'
        ? '<kbd>R</kbd>save #1'
        : '<kbd>R</kbd>save all';
}

// Shortcut hints row: collapsed to a single "? shortcuts" affordance by default;
// the expanded row lists `items` (each an inner-HTML string) plus a "? hide" toggle.
function keysRow(items) {
    if (!showKeys) {
        return '<div class="keys keys-collapsed"><span><kbd>?</kbd>shortcuts</span></div>';
    }
    let html = '<div class="keys">';
    for (let i = 0; i < items.length; i++) {
        html += '<span>' + items[i] + '</span>';
    }
    html += '<span class="keys-hide"><kbd>?</kbd>hide</span>';
    html += '</div>';
    return html;
}

let tones = {
    1: '&#772;',
    2: '&#769;',
    3: '&#780;',
    4: '&#768;',
    5: ''
};

let utones = {
    1: '\u0304',
    2: '\u0301',
    3: '\u030C',
    4: '\u0300',
    5: ''
};

function parse(s) {
    return s.match(/([^AEIOU:aeiou]*)([AEIOUaeiou:]+)([^aeiou:]*)([1-5])/);
}

function tonify(vowels, tone) {
    let html = '';
    let text = '';

    if (vowels === 'ou') {
        html = 'o' + tones[tone] + 'u';
        text = 'o' + utones[tone] + 'u';
    } else {
        let tonified = false;
        for (let i = 0; i < vowels.length; i++) {
            let c = vowels.charAt(i);
            html += c;
            text += c;
            if (c === 'a' || c === 'e') {
                html += tones[tone];
                text += utones[tone];
                tonified = true;
            } else if (i === vowels.length - 1 && !tonified) {
                html += tones[tone];
                text += utones[tone];
                tonified = true;
            }
        }
        html = html.replace(/u:/, '&uuml;');
        text = text.replace(/u:/, '\u00FC');
    }

    return [html, text];
}

function pinyinAndZhuyin(syllables, showToneColors) {
    let text = '';
    let html = '';
    let zhuyin = '';
    let a = syllables.split(/[\s·]+/);
    for (let i = 0; i < a.length; i++) {
        let syllable = a[i];

        if (syllable === ',') {
            html += ' ,';
            text += ' ,';
            continue;
        }

        if (i > 0) {
            html += ' ';
            text += ' ';
            zhuyin += ' ';
        }
        if (syllable === 'r5') {
            html += showToneColors ? '<span class="tone5">r</span>' : 'r';
            text += 'r';
            continue;
        }
        if (syllable === 'xx5') {
            html += showToneColors ? '<span class="tone5">??</span>' : '??';
            text += '??';
            continue;
        }
        let m = parse(syllable);
        if (showToneColors) {
            html += '<span class="tone' + m[4] + '">';
        }
        let t = tonify(m[2], m[4]);
        html += m[1] + t[0] + m[3];
        if (showToneColors) {
            html += '</span>';
        }
        text += m[1] + t[1] + m[3];

        zhuyin += '<span class="tone' + m[4] + '">'
            + globalThis.numericPinyin2Zhuyin(syllable) + '</span>';
    }
    return [html, text, zhuyin];
}

let miniHelp = '<div class="cz-msg"><strong>Zhongwen Chinese-English Dictionary</strong></div>'
    + '<div class="keys" style="flex-direction:column;gap:6px;">'
    + '<span><kbd>N</kbd>next word <kbd>B</kbd>prev char <kbd>M</kbd>next char</span>'
    + '<span><kbd>A</kbd>alt position <kbd>X</kbd>up <kbd>Y</kbd>down</span>'
    + '<span><kbd>R</kbd>remember <kbd>C</kbd>copy</span>'
    + '<span><kbd>S</kbd>sentence <kbd>E</kbd>characters <kbd>L</kbd>thesaurus <kbd>G</kbd>grammar <kbd>V</kbd>vocab <kbd>T</kbd>Tatoeba</span>'
    + '<span><kbd>D</kbd>compact / cycle meaning <kbd>F</kbd>full view</span>'
    + '<span><kbd>?</kbd>toggle shortcut hints in the popup</span>'
    + '<span><kbd>Shift+S</kbd>Skritter</span>'
    + '<span><kbd>Alt+W</kbd>word list</span>'
    + '<span><kbd>Alt+1</kbd>LINE <kbd>Alt+2</kbd>Forvo <kbd>Alt+3</kbd>Dict.cn</span>'
    + '<span><kbd>Alt+4</kbd>iCIBA <kbd>Alt+5</kbd>MDBG <kbd>Alt+6</kbd>Reverso <kbd>Alt+7</kbd>MoE</span>'
    + '</div>';

// event listener
chrome.runtime.onMessage.addListener(
    function (request) {
        switch (request.type) {
            case 'enable':
                enableTab();
                config = request.config;
                // Follow the saved default (this also picks up a settings change on
                // tab refocus), unless the user has manually toggled the view this session.
                if (!userToggledView) {
                    compactView = config.defView === 'compact';
                }
                break;
            case 'disable':
                disableTab();
                break;
            case 'showPopup':
                if (!request.isHelp || window === window.top) {
                    showPopup('<div class="cz-msg">' + request.text + '</div>');
                }
                break;
            case 'showHelp':
                showPopup(miniHelp);
                break;
            case 'breakdown-selection':
                if (request.text) {
                    openPanel(request.text);
                }
                break;
            default:
        }
    }
);
