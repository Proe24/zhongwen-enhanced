// search.js — find dictionary words by hanzi, pinyin, or English. Pure
// functions over the dict table; the pinyin index is built lazily once.
import { decodeEntry, rawEntry } from './dict.js';
import { plainPinyin } from './pinyin.js';

const isHan = (s) => /\p{Script=Han}/u.test(s);
const RARE = /[^一-鿿]/u; // outside the basic CJK block: rarely what was meant

let _index = null; // { bare: Map<plainPinyin, string[]> } for the current dict
let _indexDict = null;
function pinyinIndex(dict) {
  if (_index && _indexDict === dict) return _index;
  const bare = new Map();
  for (const w of Object.keys(dict.words)) {
    const raw = dict.words[w];
    if (raw[0] === '@') continue;
    const seen = new Set();
    for (const r of raw.split('\u001e')) {
      const key = plainPinyin(r.slice(0, r.indexOf('\t')));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let list = bare.get(key);
      if (!list) bare.set(key, (list = []));
      list.push(w);
    }
  }
  _index = { bare, keys: [...bare.keys()].sort() };
  _indexDict = dict;
  return _index;
}

function lowerBound(arr, s) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < s) lo = m + 1; else hi = m; } return lo; }

// rank: lower is better. Everyday words (HSK, several senses, common block) first.
function rank(dict, w, exact) {
  const e = decodeEntry(dict, w);
  const senses = e ? e.readings[0].defs.length : 0;
  const proper = e && /^[A-Z]/.test(e.readings[0].py) ? 3 : 0;
  const hsk = e && e.hsk ? e.hsk : 9;
  return (exact ? 0 : 10) + hsk + proper + (RARE.test(w) ? 8 : 0) - Math.min(3, senses) + Array.from(w).length * 0.5;
}

export function searchDict(dict, query, limit = 20) {
  const q = String(query || '').trim();
  if (!q) return [];
  const out = new Map(); // word → score
  if (isHan(q)) {
    // exact + prefix matches on headwords, then words that contain the query
    if (rawEntry(dict, q)) out.set(q, -100);
    let n = 0;
    for (const w of Object.keys(dict.words)) {
      if (w === q || dict.words[w][0] === '@') continue;
      if (w.startsWith(q)) { out.set(w, rank(dict, w, false) - 20); n++; }
      else if (w.includes(q)) { out.set(w, rank(dict, w, false)); n++; }
      if (n > 400) break;
    }
  } else if (/^[a-zA-Z0-9À-ɏ̀-ͯ\s':]+$/.test(q.normalize('NFD'))) {
    // pinyin (prefix on the bare spelling) and English (substring in a sense)
    const key = plainPinyin(q);
    if (key.length >= 2) {
      const ix = pinyinIndex(dict);
      const start = lowerBound(ix.keys, key);
      let n = 0;
      for (let i = start; i < ix.keys.length && n < 600; i++) {
        const k = ix.keys[i];
        if (!k.startsWith(key)) break;
        for (const w of ix.bare.get(k)) { out.set(w, rank(dict, w, k === key)); n++; }
      }
    }
    const ql = q.toLowerCase();
    if (ql.length >= 3) {
      let n = 0;
      for (const w of Object.keys(dict.words)) {
        const raw = dict.words[w];
        if (raw[0] === '@') continue;
        const i = raw.toLowerCase().indexOf(ql);
        if (i < 0) continue;
        // whole-word hit in a sense scores better than a substring
        const whole = new RegExp(`(^|[^a-z])${ql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(raw);
        const sc = rank(dict, w, false) + (whole ? 0 : 12) + (raw.split('\t')[2]?.toLowerCase().startsWith(ql) ? -6 : 0);
        if (!out.has(w) || out.get(w) > sc) out.set(w, sc);
        if (++n > 800) break;
      }
    }
  }
  return [...out.entries()].sort((a, b) => a[1] - b[1]).slice(0, limit).map(([w]) => ({ word: w, entry: decodeEntry(dict, w) }));
}
