// api.js — the message client every UI uses to talk to the service worker,
// which owns the dictionary and is the only writer of chrome.storage.
const call = (type, payload = {}) => new Promise((resolve, reject) => {
  let done = false;
  try {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      done = true;
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (res && res.error) return reject(new Error(res.error));
      resolve(res);
    });
  } catch (e) { if (!done) reject(e); }
});

export const api = {
  lookup: (text, opts) => call('lookup', { text, ...(opts || {}) }),
  entry: (word) => call('entry', { word }),
  segment: (text) => call('segment', { text }),
  search: (q, limit) => call('search', { q, limit }),
  state: () => call('state'),
  setEnabled: (enabled) => call('setEnabled', { enabled }),
  toggle: () => call('toggle'),
  setSettings: (patch) => call('setSettings', { patch }),
  saveWord: (entry) => call('saveWord', { entry }),
  removeWord: (w) => call('removeWord', { w }),
  setNote: (w, note) => call('setNote', { w, note }),
  saveSentence: (s) => call('saveSentence', { s }),
  removeSentence: (id) => call('removeSentence', { id }),
  setSentenceNote: (id, note) => call('setSentenceNote', { id, note }),
  grade: (w, grade) => call('grade', { w, grade }),
  resetCard: (w) => call('resetCard', { w }),
  countLookup: (word) => call('countLookup', { word }),
  exportText: (format, scope) => call('exportText', { format, scope }),
  backup: () => call('backup'),
  restore: (data, mode) => call('restore', { data, mode }),
  clearAll: () => call('clearAll'),
  openApp: (route) => call('openApp', { route }),
  siteToggle: (hostname) => call('siteToggle', { hostname }),
};
