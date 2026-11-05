// exports.js — flashcard exports and the whole-account backup format.
import { renderPinyin } from './pinyin.js';
import { SCHEMA } from './schema.js';

const clean = (s) => defuse(String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim());
// A cell that starts with = + - @ would be run as a formula by spreadsheets;
// page text and titles are untrusted, so such cells get a leading apostrophe.
const defuse = (v) => (/^[=+\-@]/.test(v) ? "'" + v : v);
const marks = (py) => renderPinyin(py, 'marks').join(' ');

// Anki: tab-separated, one note per line, with a header Anki 2.1.55+ reads.
// Fields: Simplified, Traditional, Pinyin, Meaning, Sentence, Source, Note
export function toAnki(entries) {
  const head = ['#separator:tab', '#html:false', '#columns:Simplified\tTraditional\tPinyin\tMeaning\tSentence\tSource\tNote'];
  const rows = entries.map((e) => [e.w, e.trad || e.w, marks(e.py), e.def, e.sent, e.title || e.url || '', e.note || ''].map(clean).join('\t'));
  return head.concat(rows).join('\n') + '\n';
}

// Pleco flashcard text: 简体[繁體]<tab>pinyin<tab>definition — one card per line.
export function toPleco(entries) {
  return entries.map((e) => {
    const head = e.trad && e.trad !== e.w ? `${e.w}[${e.trad}]` : e.w;
    return [head, clean(e.py), clean(e.def)].join('\t');
  }).join('\n') + '\n';
}

// Plain CSV (RFC 4180 quoting) with every field.
export function toCsv(entries) {
  const q = (s) => { const v = defuse(String(s ?? '')); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const head = ['simplified', 'traditional', 'pinyin', 'pinyin_marks', 'meaning', 'sentence', 'source_title', 'source_url', 'note', 'added'];
  const rows = entries.map((e) => [e.w, e.trad || '', e.py, marks(e.py), e.def, e.sent, e.title || '', e.url || '', e.note || '', new Date(e.addedAt || 0).toISOString()].map(q).join(','));
  return [head.join(',')].concat(rows).join('\n') + '\n';
}

export function exportText(format, entries) {
  if (format === 'anki') return toAnki(entries);
  if (format === 'pleco') return toPleco(entries);
  return toCsv(entries);
}

// ── backup ───────────────────────────────────────────────────────────────────
export function makeBackup(state) {
  const { vocab, srs, sentences, settings, stats, daily, recent } = state;
  return { app: 'zhongwen-enhanced', schema: SCHEMA, exportedAt: new Date().toISOString(), data: { vocab, srs, sentences, settings, stats, daily, recent } };
}

const str = (x) => (x == null ? '' : String(x));
export const safeUrl = (u) => (/^https?:\/\//i.test(str(u)) ? str(u) : '');
const num = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);

// Coerce a vocab entry (keyed by `w`) into the stored shape, or null if it
// isn't one. Corrupt or hostile backup files must not be able to crash the
// Library or smuggle non-http links into extension pages.
export function cleanVocabEntry(w, e) {
  if (!w || !e || typeof e !== 'object') return null;
  const out = { w, trad: str(e.trad), py: str(e.py), def: str(e.def), sent: str(e.sent), url: safeUrl(e.url), title: str(e.title), addedAt: num(e.addedAt, Date.now()) };
  if (str(e.note).trim()) out.note = str(e.note).trim();
  return out;
}
export function cleanSentence(s) {
  if (!s || typeof s !== 'object' || !str(s.text).trim()) return null;
  const out = { id: str(s.id) || String(Math.random()).slice(2), text: str(s.text), url: safeUrl(s.url), title: str(s.title), addedAt: num(s.addedAt, Date.now()) };
  if (str(s.note).trim()) out.note = str(s.note).trim();
  return out;
}
function cleanVocab(v) {
  const out = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [w, e] of Object.entries(v)) { const c = cleanVocabEntry(w, e); if (c) out[w] = c; }
  return out;
}
function cleanSrs(s, vocab) {
  const out = {};
  if (s && typeof s === 'object' && !Array.isArray(s)) for (const [w, c] of Object.entries(s)) if (vocab[w] && c && typeof c === 'object') out[w] = c;
  return out;
}
const cleanSentences = (a) => (Array.isArray(a) ? a.map(cleanSentence).filter(Boolean) : []);

// Validate a parsed backup and return the pieces of state it carries.
// `mode` 'replace' takes the file as the new truth; 'merge' keeps whatever is
// local and adds what the file has (a local entry wins on conflict).
export function applyBackup(local, parsed, mode = 'merge') {
  if (!parsed || typeof parsed !== 'object' || parsed.app !== 'zhongwen-enhanced' || !parsed.data) throw new Error('Not a Zhongwen Enhanced backup file.');
  const d = parsed.data;
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const arr = (x) => (Array.isArray(x) ? x : []);
  const fileVocab = cleanVocab(d.vocab);
  const fileSrs = cleanSrs(d.srs, fileVocab);
  const fileSentences = cleanSentences(d.sentences);
  const recent = arr(d.recent).filter((x) => typeof x === 'string').slice(0, 60);
  if (mode === 'replace') {
    return { vocab: fileVocab, srs: fileSrs, sentences: fileSentences, settings: obj(d.settings), stats: obj(d.stats), daily: d.daily && typeof d.daily === 'object' ? d.daily : null, recent };
  }
  const vocab = { ...fileVocab, ...local.vocab };
  const srs = { ...fileSrs, ...local.srs };
  const seen = new Set(local.sentences.map((s) => s.id));
  const sentences = local.sentences.concat(fileSentences.filter((s) => !seen.has(s.id))).sort((a, b) => b.addedAt - a.addedAt);
  const stats = { ...obj(d.stats) };
  for (const [k, v] of Object.entries(local.stats || {})) stats[k] = { ...(stats[k] || {}), ...v };
  return { vocab, srs, sentences, settings: local.settings, stats, daily: local.daily, recent: local.recent };
}
