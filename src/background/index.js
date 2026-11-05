// background/index.js — the service worker. Owns the dictionary (loaded once
// per worker life) and is the ONLY writer of chrome.storage, so saves from
// several tabs never race. Everything else talks to it through shared/api.js.
import { fetchGzJson, matchesAt, decodeEntry, segmentText, shortGloss, simplifiedOf } from '../shared/dict.js';
import { searchDict } from '../shared/search.js';
import { normalizeSettings } from '../shared/settings.js';
import { KEYS, SCHEMA, emptyState, migrateV1, dayKey, sentenceId, RECENT_MAX } from '../shared/schema.js';
import { gradeCard, inLearning, familiarity, reviewed } from '../shared/fsrs.js';
import { exportText, makeBackup, applyBackup } from '../shared/exports.js';

const APP_URL = chrome.runtime.getURL('app/index.html');

// ── dictionary ───────────────────────────────────────────────────────────────
let dictPromise = null;
function loadDict() {
  if (!dictPromise) {
    dictPromise = (async () => {
      const [w, hsk] = await Promise.all([
        fetchGzJson(chrome.runtime.getURL('dict/words.json.gz')),
        fetchGzJson(chrome.runtime.getURL('dict/hsk.json.gz')).catch(() => ({})),
      ]);
      return { words: w.words, hsk, source: w.source || 'CC-CEDICT' };
    })().catch((e) => { dictPromise = null; throw e; });
  }
  return dictPromise;
}
loadDict().catch(() => {}); // warm up on worker start

// ── state (cached) + serialized writes ───────────────────────────────────────
let statePromise = null;
function getState() {
  if (!statePromise) {
    statePromise = chrome.storage.local.get(KEYS).then((raw) => {
      const st = { ...emptyState() };
      for (const k of KEYS) if (raw[k] !== undefined) st[k] = raw[k];
      st.enabled = raw.enabled === true || raw.enabled === '1';
      st.settings = normalizeSettings(raw.settings);
      if (!st.vocab || typeof st.vocab !== 'object') st.vocab = {};
      if (!st.srs || typeof st.srs !== 'object') st.srs = {};
      if (!Array.isArray(st.sentences)) st.sentences = [];
      if (!st.stats || typeof st.stats !== 'object') st.stats = {};
      if (!Array.isArray(st.recent)) st.recent = [];
      return st;
    });
  }
  return statePromise;
}
let chain = Promise.resolve();
// Run `fn(state)` exclusively; it returns a patch of top-level keys to persist.
function mutate(fn) {
  const p = chain.then(async () => {
    const st = await getState();
    const patch = await fn(st);
    if (patch && Object.keys(patch).length) {
      Object.assign(st, patch);
      await chrome.storage.local.set(patch);
    }
    return st;
  });
  chain = p.catch(() => {});
  return p;
}
const bumpStat = (st, field, n = 1) => {
  const k = dayKey();
  const stats = { ...st.stats, [k]: { ...(st.stats[k] || {}), [field]: ((st.stats[k] || {})[field] || 0) + n } };
  return stats;
};

// ── badge ────────────────────────────────────────────────────────────────────
async function syncBadge() {
  const st = await getState();
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#D96A4A' });
    await chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
    await chrome.action.setBadgeText({ text: st.enabled ? 'ON' : '' });
    await chrome.action.setTitle({ title: st.enabled ? 'Zhongwen Enhanced — on (Alt+Z to turn off)' : 'Zhongwen Enhanced — off (Alt+Z to turn on)' });
  } catch { /* no action surface (e.g. tests) */ }
}
syncBadge();
// keep the badge truthful however `enabled` changes (restore, a direct write)
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.enabled) { statePromise = null; syncBadge(); } });

async function setEnabled(enabled) {
  await mutate(() => ({ enabled: !!enabled }));
  await syncBadge();
  return { enabled: !!enabled };
}

// ── lookups ──────────────────────────────────────────────────────────────────
function charInfos(dict, word) {
  const chars = Array.from(word);
  if (chars.length < 2) return [];
  return chars.map((c) => {
    const e = decodeEntry(dict, c);
    return e ? { c, py: e.readings[0].py, gloss: e.readings[0].defs.slice(0, 2).join('; ') } : { c, py: '', gloss: '' };
  });
}
function decorate(st, m, dict) {
  const v = st.vocab[m.entry.simp];
  const card = st.srs[m.entry.simp];
  return { ...m, saved: !!v, fam: v ? familiarity(card) : null, note: v && v.note ? v.note : '', chars: dict ? charInfos(dict, m.word) : [] };
}
async function lookup(text) {
  const dict = await loadDict();
  const st = await getState();
  return { matches: matchesAt(dict, text).map((m) => decorate(st, m, dict)) };
}
async function entryFor(word) {
  const dict = await loadDict();
  const st = await getState();
  const e = decodeEntry(dict, word);
  return e ? decorate(st, { word, len: Array.from(word).length, entry: e }, dict) : null;
}

// lookups are counted in memory and flushed in batches (a hover is not worth a write)
let pendingLookups = 0;
let flushTimer = null;
function countLookup(word) {
  pendingLookups++;
  mutate((st) => {
    if (!word) return null;
    const recent = [word, ...st.recent.filter((w) => w !== word)].slice(0, RECENT_MAX);
    return { recent };
  });
  if (!flushTimer) flushTimer = setTimeout(flushLookups, 15000);
}
function flushLookups() {
  flushTimer = null;
  const n = pendingLookups;
  pendingLookups = 0;
  if (n) mutate((st) => ({ stats: bumpStat(st, 'lookups', n) }));
}

// ── vocab ────────────────────────────────────────────────────────────────────
function saveWord(e) {
  return mutate((st) => {
    const w = String(e.w || '');
    if (!w) throw new Error('No word');
    if (st.vocab[w]) {
      // already saved: fill in a sentence if we never had one
      if (!st.vocab[w].sent && e.sent) return { vocab: { ...st.vocab, [w]: { ...st.vocab[w], sent: String(e.sent), url: String(e.url || ''), title: String(e.title || '') } } };
      return null;
    }
    const entry = { w, trad: String(e.trad || ''), py: String(e.py || ''), def: String(e.def || ''), sent: String(e.sent || ''), url: String(e.url || ''), title: String(e.title || ''), addedAt: Date.now() };
    return { vocab: { ...st.vocab, [w]: entry }, stats: bumpStat(st, 'saved') };
  }).then((st) => ({ saved: true, entry: st.vocab[e.w] }));
}
function removeWord(w) {
  return mutate((st) => {
    if (!st.vocab[w]) return null;
    const vocab = { ...st.vocab };
    delete vocab[w];
    const srs = { ...st.srs };
    delete srs[w];
    return { vocab, srs };
  }).then(() => ({ saved: false }));
}
function setNote(w, note) {
  return mutate((st) => {
    if (!st.vocab[w]) return null;
    const entry = { ...st.vocab[w] };
    const t = String(note || '').trim();
    if (t) entry.note = t; else delete entry.note;
    return { vocab: { ...st.vocab, [w]: entry } };
  }).then(() => ({ ok: true }));
}

// ── sentences ────────────────────────────────────────────────────────────────
function saveSentence(s) {
  return mutate((st) => {
    const text = String(s.text || '').trim();
    if (!text) throw new Error('Empty sentence');
    const id = sentenceId(text, s.url || '');
    if (st.sentences.some((x) => x.id === id)) return null;
    const entry = { id, text, url: String(s.url || ''), title: String(s.title || ''), addedAt: Date.now(), ...(s.note ? { note: String(s.note) } : {}) };
    return { sentences: [entry, ...st.sentences] };
  }).then((st) => ({ ok: true, id: sentenceId(String(s.text || '').trim(), s.url || ''), count: st.sentences.length }));
}
const removeSentence = (id) => mutate((st) => ({ sentences: st.sentences.filter((x) => x.id !== id) })).then(() => ({ ok: true }));
const setSentenceNote = (id, note) => mutate((st) => ({ sentences: st.sentences.map((x) => { if (x.id !== id) return x; const n = { ...x }; const t = String(note || '').trim(); if (t) n.note = t; else delete n.note; return n; }) })).then(() => ({ ok: true }));

// ── review ───────────────────────────────────────────────────────────────────
function grade(w, g) {
  return mutate((st) => {
    if (!st.vocab[w]) throw new Error('Word is not in your vocabulary');
    const wasNew = !reviewed(st.srs[w]);
    const card = gradeCard(st.srs[w], g);
    const k = dayKey();
    const daily = st.daily && st.daily.date === k ? { ...st.daily } : { date: k, newDone: 0, reviewDone: 0 };
    if (wasNew) daily.newDone++; else daily.reviewDone++;
    return { srs: { ...st.srs, [w]: card }, daily, stats: bumpStat(st, 'reviewed') };
  }).then((st) => ({ card: st.srs[w], learning: inLearning(st.srs[w]) }));
}
const resetCard = (w) => mutate((st) => { const srs = { ...st.srs }; delete srs[w]; return { srs }; }).then(() => ({ ok: true }));

// ── backup / restore ─────────────────────────────────────────────────────────
async function restore(data, mode) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  await mutate((st) => {
    const next = applyBackup(st, parsed, mode);
    next.settings = normalizeSettings(next.settings);
    return next;
  });
  await syncBadge();
  const st = await getState();
  return { ok: true, words: Object.keys(st.vocab).length, sentences: st.sentences.length };
}
async function clearAll() {
  await mutate(() => ({ vocab: {}, srs: {}, sentences: [], daily: null, stats: {}, recent: [] }));
  return { ok: true };
}

// ── app tab ──────────────────────────────────────────────────────────────────
async function openApp(route = '/') {
  const url = APP_URL + '#' + route;
  try {
    const tabs = await chrome.tabs.query({ url: APP_URL + '*' });
    if (tabs.length) {
      await chrome.tabs.update(tabs[0].id, { active: true, url });
      if (tabs[0].windowId != null) await chrome.windows.update(tabs[0].windowId, { focused: true });
      return { ok: true };
    }
  } catch { /* fall through */ }
  await chrome.tabs.create({ url });
  return { ok: true };
}

// ── message router ───────────────────────────────────────────────────────────
const handlers = {
  async lookup({ text }) { return lookup(String(text || '')); },
  async entry({ word }) { return { match: await entryFor(String(word || '')) }; },
  async segment({ text }) {
    const dict = await loadDict();
    const st = await getState();
    const tokens = segmentText(dict, String(text || '')).map((t) => (t.entry ? { w: t.w, simp: t.entry.simp, trad: t.entry.trad, py: t.entry.readings[0].py, gloss: shortGloss(t.entry, 2), hsk: t.entry.hsk, saved: !!st.vocab[t.entry.simp] } : t.w ? { w: t.w } : t));
    return { tokens };
  },
  async search({ q, limit }) {
    const dict = await loadDict();
    const st = await getState();
    return { results: searchDict(dict, q, limit || 20).map((r) => decorate(st, { word: r.word, len: Array.from(r.word).length, entry: r.entry }, dict)) };
  },
  async state() {
    const st = await getState();
    let dictSource = '';
    try { dictSource = (await loadDict()).source; } catch { /* dictionary unavailable */ }
    return { ...st, dictSource, appUrl: APP_URL };
  },
  async setEnabled({ enabled }) { return setEnabled(enabled); },
  async toggle() { const st = await getState(); return setEnabled(!st.enabled); },
  async setSettings({ patch }) {
    const st = await mutate((s) => ({ settings: normalizeSettings({ ...s.settings, ...(patch || {}) }) }));
    return { settings: st.settings };
  },
  async siteToggle({ hostname }) {
    const h = String(hostname || '');
    const st = await mutate((s) => {
      const list = s.settings.disabledSites.includes(h) ? s.settings.disabledSites.filter((x) => x !== h) : [...s.settings.disabledSites, h];
      return { settings: { ...s.settings, disabledSites: list } };
    });
    return { disabled: st.settings.disabledSites.includes(h) };
  },
  async saveWord({ entry }) { return saveWord(entry || {}); },
  async removeWord({ w }) { return removeWord(String(w || '')); },
  async setNote({ w, note }) { return setNote(String(w || ''), note); },
  async saveSentence({ s }) { return saveSentence(s || {}); },
  async removeSentence({ id }) { return removeSentence(id); },
  async setSentenceNote({ id, note }) { return setSentenceNote(id, note); },
  async grade({ w, grade: g }) { return grade(String(w || ''), g); },
  async resetCard({ w }) { return resetCard(String(w || '')); },
  async countLookup({ word }) { countLookup(word ? simplifiedOf((await loadDict()), String(word)) : ''); return { ok: true }; },
  async exportText({ format, scope }) {
    const st = await getState();
    let entries = Object.values(st.vocab).sort((a, b) => a.addedAt - b.addedAt);
    if (scope && scope.title) entries = entries.filter((e) => e.title === scope.title);
    if (scope && Array.isArray(scope.words)) { const set = new Set(scope.words); entries = entries.filter((e) => set.has(e.w)); }
    return { text: exportText(format, entries), count: entries.length };
  },
  async backup() { return { backup: makeBackup(await getState()) }; },
  async restore({ data, mode }) { return restore(data, mode === 'replace' ? 'replace' : 'merge'); },
  async clearAll() { return clearAll(); },
  async openApp({ route }) { return openApp(route); },
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const h = msg && handlers[msg.type];
  if (!h) { respond({ error: `Unknown message: ${msg && msg.type}` }); return false; }
  h(msg, sender).then((res) => respond(res ?? { ok: true }), (e) => respond({ error: e && e.message ? e.message : String(e) }));
  return true;
});

// ── commands, context menus, install ─────────────────────────────────────────
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'toggle') handlers.toggle({});
  if (cmd === 'open-library') openApp('/vocab');
});

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'zw-sentence', title: 'Break down "%s" with Zhongwen', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'zw-vocab', title: 'Your vocabulary', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'zw-review', title: 'Review due words', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'zw-help', title: 'Help & shortcuts', contexts: ['action'] });
  });
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'zw-sentence' && tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'openSentence', text: info.selectionText || '' }, info.frameId != null ? { frameId: info.frameId } : undefined).catch(() => {});
  } else if (info.menuItemId === 'zw-vocab') openApp('/vocab');
  else if (info.menuItemId === 'zw-review') openApp('/review');
  else if (info.menuItemId === 'zw-help') openApp('/help');
});

// Bring 1.x data forward: the old word list becomes vocab + sentences.
async function migrate() {
  const raw = await chrome.storage.local.get(null);
  if (raw.schema >= SCHEMA) return false;
  const patch = { schema: SCHEMA };
  let migrated = false;
  if (typeof raw.wordlist === 'string' && raw.wordlist.length > 2) {
    const { vocab, sentences } = migrateV1(raw.wordlist);
    if (Object.keys(vocab).length || sentences.length) {
      patch.vocab = { ...vocab, ...(raw.vocab || {}) };
      patch.sentences = [...(Array.isArray(raw.sentences) ? raw.sentences : []), ...sentences];
      migrated = true;
    }
    patch.v1Wordlist = raw.wordlist; // kept for safety; the Library's backup tools can drop it
  }
  if (raw.enabled === '1') patch.enabled = true;
  await chrome.storage.local.set(patch);
  const v1Keys = ['wordlist', 'tonecolors', 'skritterTLD', 'zhuyin', 'grammar', 'vocab_v1', 'simpTrad', 'toneColorScheme', 'direction', 'mode', 'density', 'hanziFont', 'defView', 'popupScale', 'saveToWordList', 'mv3Migrated', 'anthropicKey', 'geminiKey', 'openaiKey', 'aiProvider'].filter((k) => k in raw && k !== 'wordlist');
  if (v1Keys.length) await chrome.storage.local.remove(v1Keys);
  statePromise = null;
  return migrated;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  buildMenus();
  const migrated = await migrate();
  await syncBadge();
  if (details.reason === 'install' || migrated) openApp(migrated ? '/help?from=v1' : '/help');
});
chrome.runtime.onStartup.addListener(() => { buildMenus(); syncBadge(); });
self.addEventListener?.('activate', () => { flushLookups(); });
