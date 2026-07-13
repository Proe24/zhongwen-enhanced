/*
 Zhongwen storage helper — wraps chrome.storage.local with defaults and a
 one-time migration from MV2 localStorage. Loaded as a non-module script in
 every extension page; exposes zhongwenStorage on the global scope.
 */

'use strict';

(function () {
    const DEFAULTS = {
        tonecolors: 'yes',
        skritterTLD: 'com',
        zhuyin: 'no',
        grammar: 'yes',
        vocab: 'yes',
        simpTrad: 'classic',
        toneColorScheme: 'standard',
        direction: 'vellum',
        mode: 'light',
        density: 'regular',
        hanziFont: 'serif',
        defView: 'full',
        popupScale: '1',
        saveToWordList: 'allEntries',
        enabled: '0'
    };
    const MIGRATABLE_KEYS = Object.keys(DEFAULTS).concat(['wordlist']);

    let migrationPromise = null;

    function getLocal(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, result => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result || {});
                }
            });
        });
    }

    function setLocal(obj) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(obj, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    function removeLocal(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    function parseWordlist(value) {
        let entries = value ? JSON.parse(value) : [];
        if (!Array.isArray(entries)) throw new Error('Saved word list has an invalid format.');
        return entries;
    }

    function mergeWordlists(legacyValue, currentValue) {
        let legacyEntries = parseWordlist(legacyValue);
        let currentEntries = parseWordlist(currentValue);
        return JSON.stringify(legacyEntries.concat(currentEntries));
    }

    function withStorageLock(task) {
        let locks = globalThis.navigator && globalThis.navigator.locks;
        if (!locks || typeof locks.request !== 'function') {
            return Promise.resolve().then(task);
        }
        return locks.request('zhongwen-storage', task);
    }

    function migrate() {
        if (migrationPromise) return migrationPromise;
        migrationPromise = withStorageLock(async function () {
            let result = await getLocal(['mv3Migrated'].concat(MIGRATABLE_KEYS));
            if (result.mv3Migrated) return;
            let toWrite = { mv3Migrated: true };
            let migratedKeys = [];
            let legacyValues = {};
            try {
                let availableLegacyValues = {};
                MIGRATABLE_KEYS.forEach(k => {
                    let legacyValue = localStorage[k];
                    if (legacyValue !== undefined) availableLegacyValues[k] = legacyValue;
                });
                legacyValues = availableLegacyValues;
            } catch (e) { /* localStorage unavailable */ }
            MIGRATABLE_KEYS.forEach(k => {
                if (!Object.prototype.hasOwnProperty.call(legacyValues, k)) return;
                let legacyValue = legacyValues[k];
                if (k === 'wordlist' && result.wordlist !== undefined) {
                    toWrite.wordlist = mergeWordlists(legacyValue, result.wordlist);
                } else if (result[k] === undefined) {
                    toWrite[k] = legacyValue;
                }
                migratedKeys.push(k);
            });
            await setLocal(toWrite);
            try { migratedKeys.forEach(k => delete localStorage[k]); } catch (e) { /* localStorage unavailable */ }
        }).catch(error => {
            // A transient failure must not poison every later storage request
            // for the lifetime of the extension page.
            migrationPromise = null;
            throw error;
        });
        return migrationPromise;
    }

    function get(keys) {
        return migrate().then(() => {
            let queryKeys = Array.isArray(keys) ? keys : (keys ? [keys] : Object.keys(DEFAULTS));
            return getLocal(queryKeys).then(result => {
                let out = {};
                queryKeys.forEach(k => {
                    out[k] = result[k] !== undefined ? result[k] : DEFAULTS[k];
                });
                return out;
            });
        });
    }

    function set(key, value) {
        return migrate().then(() => {
            let obj = {};
            obj[key] = value;
            return setLocal(obj);
        });
    }

    function getRaw(keys) {
        return migrate().then(() => getLocal(keys));
    }

    function setRaw(obj) {
        return migrate().then(() => setLocal(obj));
    }

    function removeRaw(keys) {
        return migrate().then(() => removeLocal(keys));
    }

    globalThis.zhongwenStorage = { get, set, getRaw, setRaw, removeRaw, migrate, DEFAULTS };
})();
