/* eslint-env node */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('extension-page storage writes reject chrome.runtime.lastError', async function () {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
    const sandbox = {
        Error: Error,
        Promise: Promise,
        Object: Object,
        chrome: {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: function (keys, callback) { callback({ mv3Migrated: true }); },
                    set: function (values, callback) {
                        sandbox.chrome.runtime.lastError = { message: 'quota exceeded' };
                        callback();
                        sandbox.chrome.runtime.lastError = null;
                    },
                    remove: function (keys, callback) {
                        sandbox.chrome.runtime.lastError = { message: 'storage unavailable' };
                        callback();
                        sandbox.chrome.runtime.lastError = null;
                    }
                }
            }
        }
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'storage.js' });

    await assert.rejects(sandbox.zhongwenStorage.set('mode', 'dark'), /quota exceeded/);
    await assert.rejects(sandbox.zhongwenStorage.removeRaw('openaiApiKey'), /storage unavailable/);
});

test('extension-page storage reads reject asynchronously and migration retries', async function () {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
    let failuresRemaining = 1;
    const values = { mv3Migrated: true, mode: 'dark' };
    const sandbox = {
        Error: Error,
        Promise: Promise,
        Object: Object,
        chrome: {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: function (keys, callback) {
                        setImmediate(function () {
                            if (failuresRemaining) {
                                failuresRemaining--;
                                sandbox.chrome.runtime.lastError = { message: 'read unavailable' };
                                callback();
                                sandbox.chrome.runtime.lastError = null;
                                return;
                            }
                            const names = Array.isArray(keys) ? keys : [keys];
                            const result = {};
                            names.forEach(key => {
                                if (Object.prototype.hasOwnProperty.call(values, key)) {
                                    result[key] = values[key];
                                }
                            });
                            callback(result);
                        });
                    },
                    set: function (update, callback) {
                        Object.assign(values, update);
                        setImmediate(callback);
                    },
                    remove: function (keys, callback) { setImmediate(callback); }
                }
            }
        }
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'storage.js' });

    await assert.rejects(sandbox.zhongwenStorage.get('mode'), /read unavailable/);
    assert.equal((await sandbox.zhongwenStorage.get('mode')).mode, 'dark');

    failuresRemaining = 1;
    await assert.rejects(
        sandbox.zhongwenStorage.getRaw('mode'),
        /read unavailable/
    );
});

test('migration preserves background saves, identical multiplicity, and existing MV3 settings', async function () {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
    const shared = {
        timestamp: 2,
        simplified: '同',
        traditional: '同',
        pinyin: 'tóng',
        definition: 'same'
    };
    const legacyOnly = {
        timestamp: 1,
        simplified: '旧',
        traditional: '舊',
        pinyin: 'jiù',
        definition: 'legacy'
    };
    const backgroundSave = {
        id: 'new-mv3-id',
        timestamp: 3,
        simplified: '新',
        traditional: '新',
        pinyin: 'xīn',
        definition: 'saved before first extension page'
    };
    const currentShared = Object.assign({ id: 'migrated-id' }, shared);
    const values = {
        mode: 'dark',
        enabled: '1',
        wordlist: JSON.stringify([backgroundSave, currentShared])
    };
    const legacyStorage = {
        mode: 'light',
        enabled: '0',
        tonecolors: 'no',
        wordlist: JSON.stringify([legacyOnly, shared])
    };
    let setCalls = 0;
    const sandbox = {
        Error: Error,
        Promise: Promise,
        Object: Object,
        JSON: JSON,
        localStorage: legacyStorage,
        chrome: {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: function (keys, callback) {
                        const names = Array.isArray(keys) ? keys : [keys];
                        const result = {};
                        names.forEach(key => {
                            if (Object.prototype.hasOwnProperty.call(values, key)) {
                                result[key] = values[key];
                            }
                        });
                        callback(result);
                    },
                    set: function (update, callback) {
                        setCalls++;
                        Object.assign(values, update);
                        callback();
                    },
                    remove: function (keys, callback) { callback(); }
                }
            }
        }
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'storage.js' });

    await sandbox.zhongwenStorage.migrate();

    assert.equal(values.mode, 'dark');
    assert.equal(values.enabled, '1');
    assert.equal(values.tonecolors, 'no');
    assert.equal(values.mv3Migrated, true);
    const merged = JSON.parse(values.wordlist);
    assert.equal(merged.length, 4);
    assert.ok(merged.some(entry => entry.id === backgroundSave.id));
    assert.ok(merged.some(entry => entry.id === currentShared.id));
    assert.ok(merged.some(entry => entry.simplified === legacyOnly.simplified));
    assert.equal(merged.filter(entry => entry.simplified === shared.simplified).length, 2);
    assert.equal(Object.keys(legacyStorage).length, 0);

    const afterFirstMigration = values.wordlist;
    vm.runInContext('migrationPromise = null', sandbox);
    await sandbox.zhongwenStorage.migrate();
    assert.equal(values.wordlist, afterFirstMigration);
    assert.equal(setCalls, 1);
});

test('malformed overlapping wordlists remain unmarked and retryable', async function () {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');

    for (const malformedSide of ['legacy', 'current']) {
        const values = {
            wordlist: malformedSide === 'current' ? '{invalid' : '[]'
        };
        const legacyStorage = {
            wordlist: malformedSide === 'legacy' ? '{invalid' : '[]'
        };
        let setCalls = 0;
        const sandbox = {
            Error: Error,
            Promise: Promise,
            Object: Object,
            JSON: JSON,
            localStorage: legacyStorage,
            chrome: {
                runtime: { lastError: null },
                storage: {
                    local: {
                        get: function (keys, callback) {
                            const result = {};
                            keys.forEach(key => {
                                if (Object.prototype.hasOwnProperty.call(values, key)) {
                                    result[key] = values[key];
                                }
                            });
                            callback(result);
                        },
                        set: function (update, callback) {
                            setCalls++;
                            Object.assign(values, update);
                            callback();
                        },
                        remove: function (keys, callback) { callback(); }
                    }
                }
            }
        };
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(source, sandbox, { filename: 'storage.js' });

        await assert.rejects(sandbox.zhongwenStorage.migrate(), SyntaxError);
        assert.equal(setCalls, 0);
        assert.equal(values.mv3Migrated, undefined);
        assert.equal(legacyStorage.wordlist, malformedSide === 'legacy' ? '{invalid' : '[]');
        await assert.rejects(sandbox.zhongwenStorage.migrate(), SyntaxError);
        assert.equal(setCalls, 0);
    }
});
