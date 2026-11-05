import { marksToNumbers } from './pinyin.js';

// schema.js — what lives in chrome.storage.local, and how older data is
// brought forward. Pure functions; the service worker is the only writer.
//
//   enabled   : boolean — lookups on/off (global)
//   settings  : see settings.js
//   vocab     : { [simp]: { w, trad, py, def, sent, url, title, addedAt, note? } }
//   srs       : { [simp]: FSRS card }                       (see fsrs.js)
//   sentences : [ { id, text, url, title, addedAt, note? } ]  newest first
//   daily     : { date, newDone, reviewDone }               (review pacing)
//   stats     : { 'YYYY-MM-DD': { saved, reviewed, lookups } }
//   recent    : [ simp, … ]                                  newest first, ≤ 60
//   schema    : 2

export const SCHEMA = 2;
export const KEYS = ['enabled', 'settings', 'vocab', 'srs', 'sentences', 'daily', 'stats', 'recent', 'schema'];
export const RECENT_MAX = 60;

export function emptyState() {
  return { enabled: false, settings: {}, vocab: {}, srs: {}, sentences: [], daily: null, stats: {}, recent: [], schema: SCHEMA };
}

export const dayKey = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const sentenceId = (text, url) => {
  // small stable hash so re-saving the same sentence on the same page is a no-op
  let h = 2166136261;
  for (const c of `${text}\n${url || ''}`) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
};

// ── v1 → v2 ─────────────────────────────────────────────────────────────────
// Version 1.x kept one JSON-encoded array under `wordlist`:
//   { timestamp, simplified, traditional, pinyin, definition, isSentence?, notes?, list?, box? }
// Words become vocab entries (the list name is kept as the "title" so the
// Library still groups them); sentences become saved sentences, keeping the
// translation 1.x stored in `definition` (plus any literal gloss in `notes`)
// as the sentence note. 1.x stored pinyin numbered OR tone-marked depending on
// where the word was added from; everything is normalized to numbered here.
export function migrateV1(wordlistJson) {
  const vocab = {};
  const sentences = [];
  let list;
  try { list = JSON.parse(wordlistJson || '[]'); } catch { return { vocab, sentences }; }
  if (!Array.isArray(list)) return { vocab, sentences };
  for (const e of list) {
    if (!e || typeof e !== 'object' || !e.simplified) continue;
    const addedAt = Number(e.timestamp) || Date.now();
    if (e.isSentence) {
      const text = String(e.simplified);
      const note = [e.definition, e.notes].map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join('\n');
      sentences.push({ id: sentenceId(text, ''), text, url: '', title: e.list ? String(e.list) : 'Imported from version 1', addedAt, ...(note ? { note } : {}) });
      continue;
    }
    const w = String(e.simplified);
    if (vocab[w]) continue;
    vocab[w] = {
      w,
      trad: e.traditional && e.traditional !== w ? String(e.traditional) : '',
      py: marksToNumbers(String(e.pinyin || '')),
      def: String(e.definition || ''),
      sent: '',
      url: '',
      title: e.list ? String(e.list) : 'Imported from version 1',
      addedAt,
      ...(e.notes ? { note: String(e.notes) } : {}),
    };
  }
  sentences.sort((a, b) => b.addedAt - a.addedAt);
  return { vocab, sentences };
}
