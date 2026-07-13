/* eslint-env node */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function element(value) {
    return {
        value: value || '', checked: false, hidden: false, textContent: '', placeholder: '',
        style: {}, attributes: {}, listeners: {},
        addEventListener: function (type, listener) { this.listeners[type] = listener; },
        dispatch: function (type, event) {
            return this.listeners[type](event || { target: this });
        },
        getAttribute: function (name) {
            return name === 'value' ? this.value : this.attributes[name];
        },
        setAttribute: function (name, nextValue) { this.attributes[name] = nextValue; },
        removeAttribute: function (name) { delete this.attributes[name]; }
    };
}

function loadOptions() {
    const values = {
        tonecolors: 'yes', toneColorScheme: 'standard', simpTrad: 'classic',
        zhuyin: 'no', grammar: 'yes', vocab: 'yes', saveToWordList: 'allEntries',
        skritterTLD: 'com', direction: 'vellum', mode: 'light', density: 'regular',
        hanziFont: 'serif', defView: 'full', popupScale: '1', aiProvider: 'gemini',
        geminiApiKey: 'persisted-key'
    };
    const ids = {
        zhuyin: element(), grammar: element(), vocab: element(), popupScale: element('1'),
        popupScaleReset: element(), popupPreview: element(), popupScaleValue: element(),
        apiKey: element(), apiKeyStatus: element(), saveApiKey: element(), optionsStatus: element()
    };
    const groups = {
        toneColors: ['signature', 'standard', 'none'].map(element),
        simpTrad: ['classic', 'auto'].map(element),
        saveToWordList: ['allEntries', 'firstEntry'].map(element),
        skritterTLD: ['com', 'cn'].map(element),
        direction: ['vellum', 'slate', 'crimson'].map(element),
        mode: ['light', 'dark'].map(element),
        density: ['compact', 'regular', 'comfy'].map(element),
        hanziFont: ['serif', 'sans'].map(element),
        defView: ['full', 'compact'].map(element),
        aiProvider: ['gemini', 'anthropic', 'openai'].map(element)
    };
    const documentElement = element();
    const document = {
        documentElement: documentElement,
        getElementById: function (id) { return ids[id]; },
        querySelectorAll: function (selector) {
            const match = selector.match(/^input\[name="([^"]+)"\]$/);
            return match ? groups[match[1]] : [];
        },
        querySelector: function (selector) {
            if (selector.startsWith('#')) return ids[selector.slice(1)];
            let match = selector.match(/^input\[name="([^"]+)"\]\[value="([^"]+)"\]$/);
            if (match) return groups[match[1]].find(input => input.value === match[2]);
            match = selector.match(/^input\[name="([^"]+)"\]:checked$/);
            if (match) return groups[match[1]].find(input => input.checked);
            return null;
        }
    };
    let loadListener;
    const failures = { set: null, remove: null };
    const storage = {
        get: async function (keys) {
            const selected = Array.isArray(keys) ? keys : Object.keys(values);
            return Object.fromEntries(selected.map(key => [key, values[key]]));
        },
        getRaw: async function (keys) {
            const selected = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(selected.map(key => [key, values[key]]));
        },
        set: async function (key, nextValue) {
            if (failures.set) throw new Error(failures.set);
            values[key] = nextValue;
        },
        setRaw: async function (updates) {
            if (failures.set) throw new Error(failures.set);
            Object.assign(values, updates);
        },
        removeRaw: async function (keys) {
            if (failures.remove) throw new Error(failures.remove);
            (Array.isArray(keys) ? keys : [keys]).forEach(key => delete values[key]);
        }
    };
    const sandbox = {
        chrome: { runtime: { sendMessage: function () {} } },
        console: console,
        document: document,
        zhongwenStorage: storage,
        window: { addEventListener: function (type, listener) { if (type === 'load') loadListener = listener; } }
    };
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'options.js'), 'utf8');
    vm.runInContext(source, sandbox, { filename: 'options.js' });
    loadListener();
    return { document, failures, groups, ids, values };
}

async function settle() {
    await new Promise(resolve => setImmediate(resolve));
}

test('options restore persisted state and report failed preference and provider writes', async function () {
    const loaded = loadOptions();
    await settle();
    loaded.failures.set = 'quota exceeded';

    const dark = loaded.groups.mode.find(input => input.value === 'dark');
    dark.checked = true;
    await dark.dispatch('change');
    assert.equal(loaded.values.mode, 'light');
    assert.equal(loaded.document.documentElement.attributes['data-mode'], 'light');
    assert.match(loaded.ids.optionsStatus.textContent, /quota exceeded/);

    const anthropic = loaded.groups.aiProvider.find(input => input.value === 'anthropic');
    loaded.groups.aiProvider.forEach(input => { input.checked = input === anthropic; });
    await anthropic.dispatch('change');
    assert.equal(loaded.values.aiProvider, 'gemini');
    assert.equal(loaded.ids.apiKey.placeholder, 'AIza...');
    assert.match(loaded.ids.optionsStatus.textContent, /quota exceeded/);
});

test('API key failures show errors without success and restore the persisted key', async function () {
    const loaded = loadOptions();
    await settle();
    loaded.failures.set = 'quota exceeded';
    loaded.ids.apiKey.value = 'new-key';

    await loaded.ids.saveApiKey.dispatch('click');
    assert.equal(loaded.values.geminiApiKey, 'persisted-key');
    assert.equal(loaded.ids.apiKey.value, 'persisted-key');
    assert.match(loaded.ids.apiKeyStatus.textContent, /Could not save key: quota exceeded/);
    assert.doesNotMatch(loaded.ids.apiKeyStatus.textContent, /^Key saved\.$/);

    loaded.failures.set = null;
    loaded.failures.remove = 'storage unavailable';
    loaded.ids.apiKey.value = '';
    await loaded.ids.saveApiKey.dispatch('click');
    assert.equal(loaded.values.geminiApiKey, 'persisted-key');
    assert.equal(loaded.ids.apiKey.value, 'persisted-key');
    assert.match(loaded.ids.apiKeyStatus.textContent, /Could not save key: storage unavailable/);
    assert.doesNotMatch(loaded.ids.apiKeyStatus.textContent, /^Key removed\.$/);
});
