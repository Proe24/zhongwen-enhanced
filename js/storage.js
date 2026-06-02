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

    function migrate() {
        if (migrationPromise) return migrationPromise;
        migrationPromise = new Promise(resolve => {
            chrome.storage.local.get('mv3Migrated', result => {
                if (result.mv3Migrated) { resolve(); return; }
                let toWrite = { mv3Migrated: true };
                try {
                    MIGRATABLE_KEYS.forEach(k => {
                        let v = localStorage[k];
                        if (v !== undefined) toWrite[k] = v;
                    });
                } catch (e) { /* localStorage unavailable */ }
                chrome.storage.local.set(toWrite, () => {
                    try { MIGRATABLE_KEYS.forEach(k => delete localStorage[k]); } catch (e) {}
                    resolve();
                });
            });
        });
        return migrationPromise;
    }

    function get(keys) {
        return migrate().then(() => new Promise(resolve => {
            let queryKeys = Array.isArray(keys) ? keys : (keys ? [keys] : Object.keys(DEFAULTS));
            chrome.storage.local.get(queryKeys, result => {
                let out = {};
                queryKeys.forEach(k => {
                    out[k] = result[k] !== undefined ? result[k] : DEFAULTS[k];
                });
                resolve(out);
            });
        }));
    }

    function set(key, value) {
        return migrate().then(() => new Promise(resolve => {
            let obj = {};
            obj[key] = value;
            chrome.storage.local.set(obj, resolve);
        }));
    }

    function getRaw(keys) {
        return migrate().then(() => new Promise(resolve => {
            chrome.storage.local.get(keys, resolve);
        }));
    }

    function setRaw(obj) {
        return migrate().then(() => new Promise(resolve => {
            chrome.storage.local.set(obj, resolve);
        }));
    }

    globalThis.zhongwenStorage = { get, set, getRaw, setRaw, migrate, DEFAULTS };
})();
