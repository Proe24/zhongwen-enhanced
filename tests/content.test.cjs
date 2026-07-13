/* eslint-env node */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadContentScript() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
    const sentMessages = [];
    const pendingMessageCallbacks = [];
    let messageResponse = { ok: true };
    let deferMessageCallbacks = false;
    const sandbox = {
        chrome: {
            runtime: {
                onMessage: { addListener: function () {} },
                getURL: function (url) { return url; },
                sendMessage: function (message, callback) {
                    sentMessages.push(message);
                    if (!callback) return;
                    if (deferMessageCallbacks) {
                        pendingMessageCallbacks.push({ message: message, callback: callback });
                    } else {
                        callback(messageResponse);
                    }
                }
            },
            storage: { local: { get: function (_keys, callback) { if (callback) callback({}); } } }
        },
        console: console,
        requestAnimationFrame: function (callback) { callback(); },
        setTimeout: setTimeout,
        clearTimeout: clearTimeout
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'content.js' });
    return {
        sandbox: sandbox,
        sentMessages: sentMessages,
        pendingMessageCallbacks: pendingMessageCallbacks,
        setMessageResponse: function (response) { messageResponse = response; },
        setDeferMessageCallbacks: function (value) { deferMessageCallbacks = value; },
        run: code => vm.runInContext(code, sandbox)
    };
}

function installPanelHarness(loaded) {
    const scroll = {
        innerHTML: '',
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    };
    const title = { textContent: '' };
    const status = { innerHTML: '' };
    const panel = {
        setAttribute: function () {},
        classList: { add: function () {}, remove: function () {} }
    };
    loaded.sandbox.scroll = scroll;
    loaded.sandbox.panel = panel;
    loaded.sandbox.mutations = [];
    loaded.sandbox.document = {
        getElementById: function (id) {
            if (id === 'zhongwen-panel-title') return title;
            if (id === 'zhongwen-panel-scroll') return scroll;
            if (id === 'zhongwen-panel-status') return status;
            return null;
        }
    };
    loaded.sandbox.getComputedStyle = function () {
        return { color: '#222', getPropertyValue: function () { return ''; } };
    };
    loaded.run([
        "config = { direction: 'vellum', mode: 'light' };",
        'createPanel = function () { return panel; };'
    ].join('\n'));
    return { scroll: scroll, title: title };
}

test('sentence and provider markup is rendered as text', function () {
    const loaded = loadContentScript();
    loaded.sandbox.scroll = {
        innerHTML: '',
        querySelector: function () { return { addEventListener: function () {} }; },
        querySelectorAll: function () { return []; }
    };
    loaded.sandbox.payload = {
        literal: '<img src=x onerror=alert(1)>',
        idiomatic: '<script>alert(1)</script>',
        words: [{ hz: '<b>', py: 'ni3', gloss: '<iframe src=x>', role: '<svg>' }],
        grammar: ['Use **<img src=x>** here']
    };

    loaded.run("renderBreakdown(scroll, '<img src=x onerror=alert(1)>', payload, '<svg>')");

    assert.doesNotMatch(loaded.sandbox.scroll.innerHTML, /<(?:img|script|iframe|svg)\b/i);
    assert.match(loaded.sandbox.scroll.innerHTML, /&lt;img/);
    assert.match(loaded.sandbox.scroll.innerHTML, /<strong>&lt;img src=x&gt;<\/strong>/);
});

test('AI response normalization tolerates missing and non-string fields', function () {
    const loaded = loadContentScript();
    loaded.sandbox.payload = {
        literal: 42,
        words: [null, { hz: '你', py: null, gloss: 7 }],
        grammar: ['valid', 9]
    };
    const result = loaded.run('normalizeBreakdownData(payload)');

    assert.equal(result.literal, '42');
    assert.equal(result.words.length, 1);
    assert.equal(result.words[0].py, '');
    assert.deepEqual(Array.from(result.grammar), ['valid']);
    assert.equal(loaded.run("toneFromMark('nǐ')"), 3);
    assert.match(loaded.run("formatNumberedPinyin('nǐ')"), /tone3/);
});

test('a stale sentence response cannot overwrite a newer sentence panel', function () {
    const loaded = loadContentScript();
    installPanelHarness(loaded);
    loaded.setDeferMessageCallbacks(true);
    loaded.run([
        "renderBreakdown = function (_scroll, sentence) { mutations.push('sentence:' + sentence); };",
        "openPanel('old sentence');",
        "openPanel('new sentence');"
    ].join('\n'));

    assert.equal(loaded.pendingMessageCallbacks.length, 2);
    loaded.pendingMessageCallbacks[0].callback({
        provider: 'AI',
        text: '{"literal":"old","idiomatic":"old","words":[],"grammar":[]}'
    });
    assert.deepEqual(loaded.sandbox.mutations, []);

    loaded.pendingMessageCallbacks[1].callback({
        provider: 'AI',
        text: '{"literal":"new","idiomatic":"new","words":[],"grammar":[]}'
    });
    assert.deepEqual(loaded.sandbox.mutations, ['sentence:new sentence']);
});

test('stale character data cannot overwrite a newer character panel', async function () {
    const loaded = loadContentScript();
    installPanelHarness(loaded);
    loaded.run([
        'charResolvers = [];',
        'fetchCharData = function () { return new Promise(function (resolve) { charResolvers.push(resolve); }); };',
        "renderCharCard = function (ch) { mutations.push('character:' + ch); };",
        "openCharPanel('旧', '舊');",
        "openCharPanel('新', '新');"
    ].join('\n'));

    assert.equal(loaded.run('charResolvers.length'), 3);
    loaded.run("charResolvers[0]({ strokes: ['old'] }); charResolvers[1]({ strokes: ['old'] });");
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(loaded.sandbox.mutations, []);

    loaded.run("charResolvers[2]({ strokes: ['new'] });");
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(loaded.sandbox.mutations, ['character:新']);
});

test('a stale thesaurus response cannot overwrite a newer thesaurus panel', function () {
    const loaded = loadContentScript();
    installPanelHarness(loaded);
    loaded.setDeferMessageCallbacks(true);
    loaded.run([
        "renderThesaurus = function (word) { mutations.push('thesaurus:' + word); };",
        "openThesaurusPanel('旧', '舊');",
        "openThesaurusPanel('新', '新');"
    ].join('\n'));

    assert.equal(loaded.pendingMessageCallbacks.length, 2);
    loaded.pendingMessageCallbacks[0].callback({ synonyms: ['old'] });
    assert.deepEqual(loaded.sandbox.mutations, []);
    loaded.pendingMessageCallbacks[1].callback({ synonyms: ['new'] });
    assert.deepEqual(loaded.sandbox.mutations, ['thesaurus:新']);
});

test('plain shortcuts do not run while typing in editable controls', function () {
    const loaded = loadContentScript();
    loaded.run('isVisible = function () { return true; }; openPanel = function () { throw new Error("sent"); };');
    loaded.sandbox.event = {
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isTrusted: true,
        keyCode: 83,
        target: { matches: function () { return true; }, isContentEditable: false }
    };

    assert.doesNotThrow(function () { loaded.run('onKeyDown(event)'); });
});

test('synthetic page events cannot trigger privileged shortcuts or hover state', function () {
    const loaded = loadContentScript();
    loaded.run('isVisible = function () { return true; }; openPanel = function () { throw new Error("sent"); };');
    loaded.sandbox.event = {
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        isTrusted: false,
        keyCode: 83,
        target: { matches: function () { return false; }, isContentEditable: false }
    };

    assert.doesNotThrow(function () { loaded.run('onKeyDown(event)'); });
    assert.doesNotThrow(function () { loaded.run('onMouseMove({ isTrusted: false })'); });
});

test('Shift+S sends the complete dictionary entry to Skritter add-to-vocabulary', function () {
    const loaded = loadContentScript();
    loaded.run([
        "config = { skritterTLD: 'cn' };",
        "savedSearchResults = [['汉', '漢', 'hàn', 'Chinese person & language', 'han4']];",
        'isVisible = function () { return true; };'
    ].join('\n'));
    loaded.sandbox.event = {
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: true,
        isTrusted: true,
        keyCode: 83,
        target: { matches: function () { return false; }, isContentEditable: false }
    };

    loaded.run('onKeyDown(event)');

    assert.equal(loaded.sentMessages.length, 1);
    assert.equal(loaded.sentMessages[0].type, 'open');
    assert.equal(loaded.sentMessages[0].tabType, 'skritter');
    assert.equal(
        loaded.sentMessages[0].url,
        'https://skritter.cn/vocab/api/add?from=zhongwen&ref=zhongwen&lang=zh' +
            '&word=%E6%B1%89&trad=%E6%BC%A2&rdng=han4&defn=Chinese%20person%20%26%20language'
    );
});

test('plain save honors the preference while Shift+R explicitly requests all entries', function () {
    const loaded = loadContentScript();
    loaded.sandbox.document = { title: 'Page', location: { hostname: 'example.test' } };
    loaded.run([
        "savedSearchResults = [['一','一','yī','one'], ['壹','壹','yī','one formal']];",
        'showPopup = function () {};',
        'saveDisplayedEntries(false);',
        'saveDisplayedEntries(true);'
    ].join('\n'));

    assert.equal(loaded.sentMessages[0].entries.length, 2);
    assert.equal(loaded.sentMessages[0].saveMode, 'preference');
    assert.equal(loaded.sentMessages[1].saveMode, 'all');
});

test('save hints follow the configured preference and failures are shown', function () {
    const loaded = loadContentScript();
    loaded.run("config = { saveToWordList: 'allEntries' }");
    assert.match(loaded.run('primarySaveHint(2)'), /save all/);
    loaded.run("config.saveToWordList = 'firstEntryOnly'");
    assert.match(loaded.run('primarySaveHint(2)'), /save #1/);

    loaded.sandbox.document = { title: 'Page', location: { hostname: 'example.test' } };
    loaded.sandbox.lastPopup = '';
    loaded.setMessageResponse({ error: 'quota exceeded' });
    loaded.run([
        "savedSearchResults = [['一','一','yī','one']];",
        'showPopup = function (html) { lastPopup = html; };',
        'saveDisplayedEntries(false);'
    ].join('\n'));
    assert.match(loaded.sandbox.lastPopup, /Could not save/);
    assert.match(loaded.sandbox.lastPopup, /quota exceeded/);
});
