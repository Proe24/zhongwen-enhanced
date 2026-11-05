// dict.js — the runtime dictionary: decode the compact CC-CEDICT table
// (public/dict/words.json.gz — see data/build-dict.mjs), look words up, find
// every dictionary word that starts at a position, and segment runs of text.
// Pure functions over a `dict` object: { words: {headword: string}, hsk?: {} }.
import { syllables } from './pinyin.js';

export const MAX_WORD = 12; // the longest headword length we probe (idioms/proverbs)

// Load the gz table in any environment that has fetch + DecompressionStream.
export async function fetchGzJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const text = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(buf);
  return JSON.parse(text);
}

// Resolve a headword (either script) to its raw record string, following one alias.
export function rawEntry(dict, word) {
  let v = dict.words[word];
  if (v == null) return null;
  if (v[0] === '@') v = dict.words[v.slice(1)];
  return typeof v === 'string' && v[0] !== '@' ? v : null;
}

export const hasWord = (dict, word) => rawEntry(dict, word) != null;

// The simplified key a headword resolves to (a traditional alias → its target).
export function simplifiedOf(dict, word) {
  const v = dict.words[word];
  if (v == null) return word;
  return v[0] === '@' ? v.slice(1) : word;
}

// Decode one record into { simp, trad, readings:[{py, sylls, tones, trad, defs}], hsk }.
// `trad` at the top is the traditional spelling of the FIRST reading ('' = same).
export function decodeEntry(dict, word) {
  const raw = rawEntry(dict, word);
  if (raw == null) return null;
  const simp = simplifiedOf(dict, word);
  const readings = raw.split('\u001e').map((r) => {
    const [py, trad, defs] = r.split('\t');
    const sylls = syllables(py);
    return { py, sylls, tones: sylls.map((s) => s.tone), trad: trad || '', defs: defs ? defs.split('/') : [] };
  });
  const trad = readings[0].trad || '';
  return { simp, trad, readings, hsk: hskLevel(dict, simp, trad) };
}

export function hskLevel(dict, simp, trad) {
  const h = dict.hsk;
  if (!h) return 0;
  return h[simp] || (trad ? h[trad] : 0) || 0;
}

// Every dictionary word that STARTS at the beginning of `text`, longest first.
// `text` is the run of characters under the cursor (up to MAX_WORD long).
// Returns [{ word, len, entry }] with `word` as it appeared in the text.
export function matchesAt(dict, text) {
  const cps = Array.from(text);
  const out = [];
  for (let L = Math.min(MAX_WORD, cps.length); L >= 1; L--) {
    const w = cps.slice(0, L).join('');
    const entry = decodeEntry(dict, w);
    if (entry) out.push({ word: w, len: L, entry });
  }
  return out;
}

// ── segmentation (for the sentence panel) ──────────────────────────────────
// Bidirectional maximum matching: run forward and backward greedy matching and
// keep the one with fewer tokens, then fewer single-character fragments,
// then the backward result (the more accurate of the two for Chinese).
const isHan = (c) => /\p{Script=Han}/u.test(c);

function forwardMM(cps, dict) {
  const out = [];
  let i = 0;
  while (i < cps.length) {
    let hit = null;
    for (let L = Math.min(MAX_WORD, cps.length - i); L >= 2; L--) {
      const cand = cps.slice(i, i + L).join('');
      if (hasWord(dict, cand)) { hit = cand; break; }
    }
    if (hit) { out.push(hit); i += Array.from(hit).length; } else { out.push(cps[i]); i += 1; }
  }
  return out;
}
function backwardMM(cps, dict) {
  const out = [];
  let i = cps.length;
  while (i > 0) {
    let hit = null;
    for (let L = Math.min(MAX_WORD, i); L >= 2; L--) {
      const cand = cps.slice(i - L, i).join('');
      if (hasWord(dict, cand)) { hit = cand; break; }
    }
    if (hit) { out.unshift(hit); i -= Array.from(hit).length; } else { out.unshift(cps[i - 1]); i -= 1; }
  }
  return out;
}
const singles = (seg) => seg.reduce((n, w) => n + (Array.from(w).length === 1 ? 1 : 0), 0);

export function segmentRun(dict, run) {
  const cps = Array.from(run);
  if (cps.length <= 1) return cps.length ? [run] : [];
  const f = forwardMM(cps, dict);
  const b = backwardMM(cps, dict);
  if (f.length !== b.length) return f.length < b.length ? f : b;
  const sf = singles(f);
  const sb = singles(b);
  if (sf !== sb) return sf < sb ? f : b;
  return b;
}

// Segment arbitrary text into tokens: Han runs become dictionary words
// ({ w, entry }), everything else is passed through as { text }.
export function segmentText(dict, text) {
  const tokens = [];
  let run = '';
  let other = '';
  const flushRun = () => {
    if (!run) return;
    for (const w of segmentRun(dict, run)) tokens.push({ w, entry: decodeEntry(dict, w) });
    run = '';
  };
  const flushOther = () => {
    if (other) tokens.push({ text: other });
    other = '';
  };
  for (const c of Array.from(text)) {
    if (isHan(c)) { flushOther(); run += c; } else { flushRun(); other += c; }
  }
  flushRun();
  flushOther();
  return tokens;
}

// A short gloss for a word: the first 2–3 senses of its primary reading.
export function shortGloss(entry, max = 3) {
  if (!entry) return '';
  return entry.readings[0].defs.slice(0, max).join('; ');
}
