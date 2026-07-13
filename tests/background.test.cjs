/* eslint-env node */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadBackground(initialStorage) {
    let source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
    source = source.replace(
        "import { ZhongwenDictionary } from './dict.js';",
        'class ZhongwenDictionary { constructor() {} wordSearch(text) { return { data: [], text: text }; } }'
    );

    const storage = Object.assign({ enabled: '0', saveToWordList: 'allEntries' }, initialStorage);
    const fetchStarts = [];
    const badgeTexts = [];
    const tabMessages = [];
    const createdMenus = [];
    let storageFailure = null;
    let storageReadFailure = null;
    let now = 10000;
    const FakeDate = { now: function () { return now; } };
    const listeners = {};
    const event = name => ({ addListener: function (listener) { listeners[name] = listener; } });
    const sandbox = {
        Date: FakeDate,
        Math: Math,
        Promise: Promise,
        Map: Map,
        Set: Set,
        Error: Error,
        JSON: JSON,
        Object: Object,
        String: String,
        parseInt: parseInt,
        crypto: globalThis.crypto,
        console: console,
        setTimeout: function (callback, delay) { now += delay || 0; callback(); return 1; },
        fetch: async function () {
            fetchStarts.push(now);
            return {
                ok: true,
                status: 200,
                headers: { get: function () { return null; } },
                json: async function () {
                    return { candidates: [{ content: { parts: [{ text: '{}' }] } }] };
                },
                text: async function () { return ''; }
            };
        },
        chrome: {
            storage: {
                local: {
                    get: function (keys, callback) {
                        if (storageReadFailure) {
                            sandbox.chrome.runtime.lastError = { message: storageReadFailure };
                            callback();
                            sandbox.chrome.runtime.lastError = null;
                            return;
                        }
                        const names = Array.isArray(keys) ? keys : [keys];
                        const result = {};
                        names.forEach(function (key) {
                            if (Object.prototype.hasOwnProperty.call(storage, key)) result[key] = storage[key];
                        });
                        callback(result);
                    },
                    set: function (values, callback) {
                        const failure = typeof storageFailure === 'function'
                            ? storageFailure(values)
                            : storageFailure;
                        if (failure) {
                            sandbox.chrome.runtime.lastError = { message: failure };
                            if (callback) callback();
                            sandbox.chrome.runtime.lastError = null;
                            return;
                        }
                        Object.assign(storage, values);
                        if (callback) callback();
                    }
                }
            },
            action: {
                onClicked: event('actionClicked'),
                setIcon: function () {}, setBadgeBackgroundColor: function () {},
                setBadgeText: function (details) { badgeTexts.push(details.text); }
            },
            tabs: {
                onActivated: event('tabActivated'), onUpdated: event('tabUpdated'), onRemoved: event('tabRemoved'),
                sendMessage: async function (tabId, message) { tabMessages.push(message.type); },
                reload: function () {}, get: function () {},
                update: function () {}, create: function () {}
            },
            contextMenus: {
                onClicked: event('contextClicked'), removeAll: function (callback) { if (callback) callback(); },
                create: function (details) { createdMenus.push(details.id); }
            },
            runtime: {
                onMessage: event('runtimeMessage'), getURL: function (value) { return value; }, lastError: null
            },
            windows: { getAll: function () {} }
        }
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'background.js' });
    return {
        sandbox: sandbox,
        storage: storage,
        fetchStarts: fetchStarts,
        badgeTexts: badgeTexts,
        tabMessages: tabMessages,
        createdMenus: createdMenus,
        setStorageFailure: function (message) { storageFailure = message; },
        setStorageReadFailure: function (message) { storageReadFailure = message; },
        listeners: listeners,
        run: code => vm.runInContext(code, sandbox)
    };
}

test('provider requests are serialized and duplicate sentences coalesce', async function () {
    const loaded = loadBackground({ aiProvider: 'gemini', geminiApiKey: 'key' });
    const results = await loaded.run("Promise.all([performBreakdown({sentence:'A', prompt:'A'}), performBreakdown({sentence:'B', prompt:'B'})])");
    assert.equal(results.length, 2);
    assert.equal(loaded.fetchStarts.length, 2);
    assert.ok(loaded.fetchStarts[1] - loaded.fetchStarts[0] >= 2000);

    loaded.fetchStarts.length = 0;
    await loaded.run("Promise.all([performBreakdown({sentence:'C', prompt:'C'}), performBreakdown({sentence:'C', prompt:'C'})])");
    assert.equal(loaded.fetchStarts.length, 1);
});

test('concurrent additions preserve every word-list entry', async function () {
    const loaded = loadBackground({ wordlist: '[]' });
    loaded.sandbox.first = { entries: [{ simplified: '一' }], list: 'A' };
    loaded.sandbox.second = { entries: [{ simplified: '二' }], list: 'B' };

    await loaded.run('Promise.all([handleAdd(first), handleAdd(second)])');

    const entries = JSON.parse(loaded.storage.wordlist);
    assert.deepEqual(entries.map(entry => entry.simplified), ['一', '二']);
    assert.ok(entries.every(entry => entry.id));
});

test('word-list preference controls plain saves and explicit save-all overrides it', async function () {
    const request = {
        entries: [{ simplified: '一' }, { simplified: '二' }],
        list: 'A'
    };
    const saveAll = loadBackground({ wordlist: '[]', saveToWordList: 'allEntries' });
    saveAll.sandbox.request = request;
    await saveAll.run('handleAdd(request)');
    assert.equal(JSON.parse(saveAll.storage.wordlist).length, 2);

    const saveFirst = loadBackground({ wordlist: '[]', saveToWordList: 'firstEntryOnly' });
    saveFirst.sandbox.request = request;
    await saveFirst.run('handleAdd(request)');
    assert.equal(JSON.parse(saveFirst.storage.wordlist).length, 1);

    const forced = loadBackground({ wordlist: '[]', saveToWordList: 'firstEntryOnly' });
    forced.sandbox.request = Object.assign({ saveMode: 'all' }, request);
    await forced.run('handleAdd(request)');
    assert.equal(JSON.parse(forced.storage.wordlist).length, 2);
});

test('word-list edits and additions are serialized without overwriting each other', async function () {
    const existing = { id: 'existing', simplified: '旧', notes: '' };
    const loaded = loadBackground({ wordlist: JSON.stringify([existing]) });
    loaded.sandbox.addition = { entries: [{ simplified: '新' }], list: 'A' };
    loaded.sandbox.edit = {
        operation: 'update', id: 'existing', patch: { notes: 'updated' }
    };

    await loaded.run('Promise.all([handleAdd(addition), mutateWordlist(edit)])');

    const entries = JSON.parse(loaded.storage.wordlist);
    assert.equal(entries.length, 2);
    assert.equal(entries.find(entry => entry.id === 'existing').notes, 'updated');
    assert.ok(entries.some(entry => entry.simplified === '新'));
});

test('storage write failures reject saves and do not change activation state', async function () {
    const loaded = loadBackground({ wordlist: '[]' });
    await Promise.resolve();
    loaded.setStorageFailure('quota exceeded');

    const response = await new Promise(resolve => {
        loaded.listeners.runtimeMessage(
            { type: 'add', entries: [{ simplified: '失败' }] }, {}, resolve
        );
    });
    assert.match(response.error, /quota exceeded/);
    assert.deepEqual(JSON.parse(loaded.storage.wordlist), []);

    await assert.rejects(loaded.run('activateExtension(1, false)'), /quota exceeded/);
    assert.equal(loaded.run('isActivated'), false);
    assert.equal(loaded.storage.enabled, '0');
});

test('background storage reads reject chrome.runtime.lastError', async function () {
    const loaded = loadBackground({ wordlist: '[]' });
    await Promise.resolve();
    loaded.setStorageReadFailure('storage unavailable');

    await assert.rejects(loaded.run("getStorage('wordlist')"), /storage unavailable/);

    const response = await new Promise(resolve => {
        loaded.listeners.runtimeMessage({ type: 'wordlist-get' }, {}, resolve);
    });
    assert.match(response.error, /storage unavailable/);
});

test('breakdown storage read failures return exactly one listener error response', async function () {
    const loaded = loadBackground({ aiProvider: 'gemini', geminiApiKey: 'key' });
    await Promise.resolve();
    loaded.setStorageReadFailure('provider settings unavailable');

    let callbackCount = 0;
    let response;
    loaded.listeners.runtimeMessage({
        type: 'breakdown', sentence: '中文', prompt: 'prompt'
    }, {}, function (value) {
        callbackCount++;
        response = value;
    });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(callbackCount, 1);
    assert.match(response.error, /provider settings unavailable/);
    assert.equal(loaded.fetchStarts.length, 0);
});

test('legacy word lists remain stable and deletable when ID migration exceeds quota', async function () {
    const legacy = [
        {
            timestamp: 1,
            simplified: '旧',
            traditional: '舊',
            pinyin: 'jiù',
            definition: 'old'
        },
        {
            timestamp: 2,
            simplified: '新',
            traditional: '新',
            pinyin: 'xīn',
            definition: 'new'
        }
    ];
    const loaded = loadBackground({ wordlist: JSON.stringify(legacy) });
    await Promise.resolve();
    loaded.setStorageFailure(function (values) {
        if (!values.wordlist) return null;
        const stored = JSON.parse(values.wordlist);
        return stored.some(entry => entry.id && entry.id.startsWith('legacy-'))
            ? 'quota exceeded'
            : null;
    });

    async function send(message) {
        return new Promise(resolve => loaded.listeners.runtimeMessage(message, {}, resolve));
    }

    const firstRead = await send({ type: 'wordlist-get' });
    const secondRead = await send({ type: 'wordlist-get' });
    assert.equal(firstRead.error, undefined);
    assert.deepEqual(
        secondRead.entries.map(entry => entry.id),
        firstRead.entries.map(entry => entry.id)
    );
    assert.ok(firstRead.entries.every(entry => entry.id.startsWith('legacy-')));

    const removedId = firstRead.entries[0].id;
    const deleteResponse = await send({
        type: 'wordlist-mutate', operation: 'delete', ids: [removedId]
    });
    assert.equal(deleteResponse.error, undefined);
    assert.deepEqual(JSON.parse(loaded.storage.wordlist), [legacy[1]]);

    const afterDelete = await send({ type: 'wordlist-get' });
    assert.equal(afterDelete.error, undefined);
    assert.equal(afterDelete.entries.length, 1);
    assert.equal(afterDelete.entries[0].id, firstRead.entries[1].id);
});

test('duplicate transient legacy IDs reject stale delete and update mutations', async function () {
    const duplicate = {
        timestamp: 1,
        simplified: '同',
        traditional: '同',
        pinyin: 'tóng',
        definition: 'same'
    };
    const loaded = loadBackground({
        wordlist: JSON.stringify([duplicate, Object.assign({}, duplicate)])
    });
    await Promise.resolve();
    loaded.setStorageFailure(function (values) {
        if (!values.wordlist) return null;
        const stored = JSON.parse(values.wordlist);
        return stored.some(entry => entry.id && entry.id.startsWith('legacy-'))
            ? 'quota exceeded'
            : null;
    });

    async function send(message) {
        return new Promise(resolve => loaded.listeners.runtimeMessage(message, {}, resolve));
    }

    const firstRead = await send({ type: 'wordlist-get' });
    assert.equal(firstRead.entries.length, 2);
    const firstId = firstRead.entries[0].id;
    const staleRemainingId = firstRead.entries[1].id;
    assert.notEqual(firstId, staleRemainingId);

    const firstDelete = await send({
        type: 'wordlist-mutate', operation: 'delete', ids: [firstId]
    });
    assert.equal(firstDelete.error, undefined);
    assert.equal(JSON.parse(loaded.storage.wordlist).length, 1);

    const staleUpdate = await send({
        type: 'wordlist-mutate', operation: 'update', id: staleRemainingId,
        patch: { notes: 'must not be reported as saved' }
    });
    assert.match(staleUpdate.error, /word list changed/i);
    assert.equal(JSON.parse(loaded.storage.wordlist)[0].notes, undefined);

    const staleDelete = await send({
        type: 'wordlist-mutate', operation: 'delete', ids: [staleRemainingId]
    });
    assert.match(staleDelete.error, /word list changed/i);
    assert.equal(JSON.parse(loaded.storage.wordlist).length, 1);

    const refreshed = await send({ type: 'wordlist-get' });
    assert.notEqual(refreshed.entries[0].id, staleRemainingId);
    const finalDelete = await send({
        type: 'wordlist-mutate', operation: 'delete', ids: [refreshed.entries[0].id]
    });
    assert.equal(finalDelete.error, undefined);
    assert.deepEqual(JSON.parse(loaded.storage.wordlist), []);
});

test('a search waits for a cold dictionary load before responding', async function () {
    const loaded = loadBackground({});
    loaded.run([
        'dict = undefined;',
        'dictLoading = undefined;',
        'loadDictionary = function () {',
        '  return new Promise(function (resolve) { globalThis.resolveDictionary = resolve; });',
        '};'
    ].join('\n'));

    let response;
    loaded.listeners.runtimeMessage(
        { type: 'search', text: '中文', originalText: '中文' },
        {},
        function (value) { response = value; }
    );
    await Promise.resolve();
    assert.equal(response, undefined);

    loaded.sandbox.resolveDictionary({
        wordSearch: function () { return { data: [], matchLen: 2 }; },
        hasGrammarKeyword: function () { return false; },
        hasVocabKeyword: function () { return false; }
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(response.originalText, '中文');
});

test('a stale activation cannot turn UI back on after deactivation', async function () {
    const loaded = loadBackground({});
    loaded.run([
        'ensureDictionary = function () {',
        '  return new Promise(function (resolve) { globalThis.resolveDictionary = resolve; });',
        '};'
    ].join('\n'));

    const activation = loaded.run('activateExtension(1, false)');
    await Promise.resolve();
    const deactivation = loaded.run('deactivateExtension()');
    await deactivation;
    loaded.sandbox.resolveDictionary({});
    await activation;

    assert.equal(loaded.run('isActivated'), false);
    assert.equal(loaded.storage.enabled, '0');
    assert.equal(loaded.badgeTexts[loaded.badgeTexts.length - 1], '');
    assert.ok(!loaded.tabMessages.includes('enable'));
});

test('the first action click waits for restored enabled state before toggling', async function () {
    const loaded = loadBackground({ enabled: '1' });
    await loaded.run('activateExtensionToggle({ id: 1 })');

    assert.equal(loaded.run('isActivated'), false);
    assert.equal(loaded.storage.enabled, '0');
    assert.equal(loaded.badgeTexts[loaded.badgeTexts.length - 1], '');
});

test('stale help and menu continuations cannot recreate enabled UI', async function () {
    const help = loadBackground({});
    help.run([
        'ensureDictionary = function () { return Promise.resolve({}); };',
        'chrome.tabs.sendMessage = function (tabId, message) {',
        "  if (message.type === 'showHelp') return new Promise(function (resolve) { globalThis.resolveHelp = resolve; });",
        '  return Promise.resolve();',
        '};'
    ].join('\n'));
    const activationWithHelp = help.run('activateExtension(1, true)');
    while (!help.sandbox.resolveHelp) await Promise.resolve();
    await help.run('deactivateExtension()');
    help.sandbox.resolveHelp();
    await activationWithHelp;
    assert.equal(help.badgeTexts[help.badgeTexts.length - 1], '');
    assert.equal(help.createdMenus.length, 0);

    const menus = loadBackground({});
    menus.run([
        'ensureDictionary = function () { return Promise.resolve({}); };',
        'chrome.contextMenus.removeAll = function (callback) {',
        '  if (callback) globalThis.resolveMenu = callback;',
        '};'
    ].join('\n'));
    const activationWithMenus = menus.run('activateExtension(1, false)');
    while (!menus.sandbox.resolveMenu) await Promise.resolve();
    await menus.run('deactivateExtension()');
    menus.sandbox.resolveMenu();
    await activationWithMenus;
    assert.equal(menus.badgeTexts[menus.badgeTexts.length - 1], '');
    assert.equal(menus.createdMenus.length, 0);
});
