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

/* global globalThis */

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

let timer;

let altView = 0;

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
        panelOpen = false;
    }

    clearHighlight();
}

// ── Sentence Breakdown Panel ─────────────────────────────────────────

let panelOpen = false;

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
            '<span class="title">Sentence Breakdown</span>' +
            '<button class="close" id="zhongwen-panel-close">&times;</button>' +
        '</header>' +
        '<div class="scroll" id="zhongwen-panel-scroll"></div>';
    document.documentElement.appendChild(panel);
    document.getElementById('zhongwen-panel-close').addEventListener('click', closePanel);
    return panel;
}

let lastPanelSentence = '';

function openPanel(sentence) {
    if (!sentence) return;
    if (panelOpen && sentence === lastPanelSentence) return;
    lastPanelSentence = sentence;
    let panel = createPanel();
    panel.setAttribute('data-direction', config.direction || 'vellum');
    panel.setAttribute('data-mode', config.mode || 'light');
    let scroll = document.getElementById('zhongwen-panel-scroll');

    scroll.innerHTML =
        '<div class="src-sentence">' + sentence + '</div>' +
        '<div class="ai-status" id="zhongwen-panel-status">' +
            '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
            '<span>Analyzing sentence…</span>' +
        '</div>';

    chrome.storage.local.get('aiProvider', function (result) {
        let names = { anthropic: 'Claude', gemini: 'Gemini', openai: 'ChatGPT' };
        let name = names[result.aiProvider] || 'AI';
        let el = document.getElementById('zhongwen-panel-status');
        if (el) el.innerHTML =
            '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
            '<span>Asking ' + name + ' to break down sentence…</span>';
    });

    panelOpen = true;
    requestAnimationFrame(function () {
        panel.classList.add('is-open');
    });

    chrome.runtime.sendMessage({
        type: 'breakdown',
        sentence: sentence,
        prompt: buildBreakdownPrompt(sentence)
    }, function (response) {
        if (!panelOpen) return;
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
                '<div class="src-sentence">' + sentence + '</div>' +
                '<div class="grammar-notes" style="border-left-color:var(--tone-1)">' +
                    '<strong>Could not reach ' + providerLabel + '.</strong>' +
                    '<p style="margin:6px 0 0;font-size:13px">' + friendly + '</p>' +
                '</div>';
            return;
        }
        let providerName = response.provider || 'AI';
        let data = parseAIResponse(response.text);
        if (data) {
            renderBreakdown(scroll, sentence, data, providerName);
        } else {
            renderRawFallback(scroll, sentence, response.text, providerName);
        }
    });
}

function renderBreakdown(scroll, sentence, data, providerName) {
    let html = '';
    html += '<div class="src-sentence">' + sentence + '</div>';

    html += '<div class="translation-grid">';
    html += '<div class="trans-card idiomatic"><div class="label">Idiomatic</div><div class="text">' + (data.idiomatic || '') + '</div></div>';
    html += '<div class="trans-card literal"><div class="label">Literal</div><div class="text">' + (data.literal || '') + '</div></div>';
    html += '</div>';

    if (data.words && data.words.length > 0) {
        html += '<div class="section-label">Word by word</div>';
        html += '<div class="breakdown-list">';
        data.words.forEach(function (w, i) {
            html += '<div class="breakdown-row">';
            html += '<div class="hz">' + toneColorHanziNumbered(w.hz, w.py) + '</div>';
            html += '<div class="meta">';
            html += '<div class="py">' + formatNumberedPinyin(w.py) + '</div>';
            html += '<div class="gloss">' + (w.gloss || '') + '</div>';
            if (w.role && w.role !== 'other') {
                html += '<div class="role">' + w.role + '</div>';
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
            let formatted = g.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            html += '<li>' + formatted + '</li>';
        });
        html += '</ul></div>';
    }

    html += '<div class="ai-foot">';
    html += '<span>Generated by ' + (providerName || 'AI') + '</span>';
    html += '<button class="save" id="zhongwen-panel-save">Save sentence</button>';
    html += '</div>';

    scroll.innerHTML = html;

    document.getElementById('zhongwen-panel-save').addEventListener('click', function () {
        saveSentence(sentence, data);
        this.classList.add('is-saved');
        this.textContent = '✓ Saved';
    });

    scroll.querySelectorAll('.add-word').forEach(function (btn) {
        btn.addEventListener('click', function () {
            let w = data.words[parseInt(this.dataset.wordIdx)];
            if (!w) return;
            chrome.runtime.sendMessage({
                type: 'add',
                entries: [{
                    simplified: w.hz,
                    traditional: w.hz,
                    pinyin: numberedToMarkPinyin(w.py),
                    definition: w.gloss || ''
                }],
                list: document.title || document.location.hostname
            });
            this.classList.add('is-saved');
            this.textContent = '✓';
        });
    });
}

function parseAIResponse(text) {
    let raw = text.trim();
    // Strip code fences
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    // Extract first JSON object
    let m = raw.match(/\{[\s\S]*\}/);
    if (!m) return parseAIPlainText(text);
    raw = m[0];

    // Strategy 1: direct parse
    try { return JSON.parse(raw); } catch (e) {}

    // Strategy 2: collapse newlines, fix trailing commas
    let cleaned = raw.replace(/[\r\n]+/g, ' ').replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(cleaned); } catch (e) {}

    // Strategy 3: strip control chars, fix smart quotes
    cleaned = cleaned.replace(/[\x00-\x1f\x7f]/g, ' ')
                     .replace(/“|”/g, '"')
                     .replace(/‘|’/g, "'");
    try { return JSON.parse(cleaned); } catch (e) {}

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
    } catch (e) {}

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
    } catch (e) {}
    return null;
}

function renderRawFallback(scroll, sentence, text, providerName) {
    let raw = text.trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
        .replace(/[{}[\]"]/g, '').trim();
    let lines = raw.split('\n').filter(function(l) { return l.trim(); });
    let html = '<div class="src-sentence">' + sentence + '</div>';
    html += '<div class="section-label">AI Analysis</div>';
    html += '<div class="grammar-notes"><ul>';
    lines.forEach(function(line) {
        let cleaned = line.trim().replace(/^[-,]/, '').trim();
        if (cleaned) html += '<li>' + cleaned + '</li>';
    });
    html += '</ul></div>';
    html += '<div class="ai-foot"><span>Raw response from ' + (providerName || 'AI') + ' (could not parse structured data)</span></div>';
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
        html += '<span class="tone' + tone + '">' + chars[i] + '</span>';
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
            let marked = parsed[1] + t[0] + parsed[3];
            return '<span class="tone' + parsed[4] + '">' + marked + '</span>';
        }
        let tone = toneFromMark(s);
        return '<span class="tone' + tone + '">' + s + '</span>';
    }).join(' ');
}

function saveSentence(sentence, data) {
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
    chrome.runtime.sendMessage({ 'type': 'add', 'entries': [entry], 'list': document.title || document.location.hostname });
}

function closePanel() {
    let panel = document.getElementById('zhongwen-panel');
    if (panel) {
        panel.classList.remove('is-open');
        panelOpen = false;
    }
}

function saveEntry(index) {
    if (index < 0 || index >= savedSearchResults.length) return;
    let r = savedSearchResults[index];
    chrome.runtime.sendMessage({
        'type': 'add',
        'entries': [{
            simplified: r[0],
            traditional: r[1],
            pinyin: r[2],
            definition: r[3]
        }],
        'list': document.title || document.location.hostname
    });
    let msg;
    if (savedSearchResults.length === 1) {
        msg = 'Saved to word list.';
    } else {
        msg = 'Saved #' + (index + 1) + ' to word list.';
    }
    msg += '<br><kbd>Alt+W</kbd> to open word list.';
    showPopup('<div class="cz-msg">' + msg + '</div>', null, -1, -1);
}

function onKeyDown(keyDown) {

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
                let all = [];
                for (let j = 0; j < savedSearchResults.length; j++) {
                    all.push({
                        simplified: savedSearchResults[j][0],
                        traditional: savedSearchResults[j][1],
                        pinyin: savedSearchResults[j][2],
                        definition: savedSearchResults[j][3]
                    });
                }
                chrome.runtime.sendMessage({ 'type': 'add', 'entries': all, 'list': document.title || document.location.hostname });
                showPopup('<div class="cz-msg">Saved all ' + all.length + ' entries.<br><kbd>Alt+W</kbd> to open word list.</div>', null, -1, -1);
            } else {
                saveEntry(0);
            }
            break;

        case 83: // 's'
            if (keyDown.shiftKey) {
                // Shift+S: Skritter
                let skritter = 'https://skritter.com';
                if (config.skritterTLD === 'cn') {
                    skritter = 'https://skritter.cn';
                }
                skritter +=
                    '/vocab/api/add?from=zhongwen&ref=zhongwen&lang=zh&word=' +
                    encodeURIComponent(savedSearchResults[0][0]) +
                    '&trad=' + encodeURIComponent(savedSearchResults[0][1]) +
                    '&rdng=' + encodeURIComponent(savedSearchResults[0][4]) +
                    '&defn=' + encodeURIComponent(savedSearchResults[0][3]);
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

        case 88: // 'x'
            altView = 0;
            popY -= 20;
            triggerSearch();
            break;

        case 89: // 'y'
            altView = 0;
            popY += 20;
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

    showPopup(makeHtml(result, config.tonecolors !== 'no'), savedTarget, popX, popY);
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
        popup.style.left = '0px';
        popup.style.top = '-9999px';

        let pW = popup.offsetWidth;
        let pH = popup.offsetHeight;

        if (pW <= 0) pW = 240;
        if (pH <= 0) pH = 80;

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
                if (x < 0) x = 0;
            }
        } else {
            if (x + pW > window.innerWidth - 20) {
                x = (window.innerWidth - pW) - 20;
                if (x < 0) x = 0;
            }

            let v = 25;
            if (y + v + pH > window.innerHeight) {
                let t = y - pH - 30;
                if (t >= 0) y = t;
            } else {
                y += v;
            }
        }
    }

    if (x !== -1 && y !== -1) {
        popup.style.left = (x / scale) + 'px';
        popup.style.top = (y / scale) + 'px';
    }
    popup.style.display = '';
    popup.offsetHeight;
    popup.classList.add('is-visible');
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
        try { document.execCommand('copy'); } catch (e) {}
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

function makeHtml(result, showToneColors) {

    let entry;
    let html = '';
    let texts = [];

    if (result === null) return '';

    for (let i = 0; i < result.data.length; ++i) {
        entry = result.data[i][0].match(/^([^\s]+?)\s+([^\s]+?)\s+\[(.*?)\]?\s*\/(.+)\//);
        if (!entry) continue;

        let simplified = entry[2];
        let traditional = entry[1];
        let rawPinyin = entry[3];

        html += '<div class="entry">';
        if (result.data.length > 1) {
            html += '<span class="entry-num">' + (i + 1) + '</span>';
        }
        html += '<div class="head">';

        // Hanzi
        if (config.simpTrad === 'auto') {
            let word = result.data[i][1];
            html += '<div class="hanzi">' + toneColorHanzi(word, rawPinyin, showToneColors) + '</div>';
        } else {
            html += '<div class="hanzi">';
            html += toneColorHanzi(simplified, rawPinyin, showToneColors);
            if (traditional !== simplified) {
                html += '<span class="alt">' + toneColorHanzi(traditional, rawPinyin, showToneColors) + '</span>';
            }
            html += '</div>';
        }

        // Pinyin
        let p = pinyinAndZhuyin(rawPinyin, showToneColors);
        html += '<div class="pinyin">' + p[0] + '</div>';

        // Zhuyin
        if (config.zhuyin === 'yes') {
            html += '<span class="zhuyin">' + p[2] + '</span>';
        }

        html += '</div>'; // .head

        // Definition
        let translation = entry[4].replace(/\//g, '; ');
        html += '<p class="def">' + translation + '</p>';

        // Grammar
        if (config.grammar !== 'no' && result.grammar && result.grammar.index === i) {
            html += '<div class="grammar">Press <kbd>G</kbd> for grammar and usage notes.</div>';
        }

        // Vocab
        if (config.vocab !== 'no' && result.vocab && result.vocab.index === i) {
            html += '<div class="grammar">Press <kbd>V</kbd> for vocabulary notes.</div>';
        }

        html += '</div>'; // .entry

        texts[i] = [simplified, traditional, p[1], translation, rawPinyin];
    }

    if (result.more) {
        html += '<div class="cz-msg">&hellip;</div>';
    }

    html += '<div class="keys">';
    html += '<span><kbd>R</kbd>save' + (result.data.length > 1 ? ' #1' : '') + '</span>';
    if (result.data.length > 1) {
        html += '<span><kbd>1</kbd>–<kbd>' + result.data.length + '</kbd>save #</span>';
        html += '<span><kbd>Shift+R</kbd>save all</span>';
    }
    html += '<span><kbd>S</kbd>breakdown</span>';
    html += '<span><kbd>C</kbd>copy</span>';
    html += '<span><kbd>N</kbd>next word</span>';
    html += '</div>';

    savedSearchResults = texts;
    savedSearchResults.grammar = result.grammar;
    savedSearchResults.vocab = result.vocab;

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
    + '<span><kbd>S</kbd>sentence <kbd>G</kbd>grammar <kbd>V</kbd>vocab <kbd>T</kbd>Tatoeba</span>'
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
