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
