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
    let messageResponse = { ok: true };
    const sandbox = {
        chrome: {
            runtime: {
                onMessage: { addListener: function () {} },
                sendMessage: function (message, callback) {
                    sentMessages.push(message);
                    if (callback) callback(messageResponse);
                }
            },
            storage: { local: { get: function () {} } }
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
        setMessageResponse: function (response) { messageResponse = response; },
        run: code => vm.runInContext(code, sandbox)
    };
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

test('a newer panel session invalidates older asynchronous work', function () {
    const loaded = loadContentScript();
    const first = loaded.run("beginPanelSession('sentence', 'A')");
    const second = loaded.run("beginPanelSession('sentence', 'B')");

    loaded.sandbox.first = first;
    loaded.sandbox.second = second;
    assert.equal(loaded.run('isCurrentPanelSession(first)'), false);
    assert.equal(loaded.run('isCurrentPanelSession(second)'), true);
    loaded.run('invalidatePanelSession()');
    assert.equal(loaded.run('isCurrentPanelSession(second)'), false);
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
