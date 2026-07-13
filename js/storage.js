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

    function migrate() {
        if (migrationPromise) return migrationPromise;
        migrationPromise = getLocal('mv3Migrated').then(result => {
            if (result.mv3Migrated) return;
            let toWrite = { mv3Migrated: true };
            try {
                MIGRATABLE_KEYS.forEach(k => {
                    let v = localStorage[k];
                    if (v !== undefined) toWrite[k] = v;
                });
            } catch (e) { /* localStorage unavailable */ }
            return setLocal(toWrite).then(() => {
                try { MIGRATABLE_KEYS.forEach(k => delete localStorage[k]); } catch (e) { /* localStorage unavailable */ }
            });
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
