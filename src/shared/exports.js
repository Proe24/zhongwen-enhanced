// exports.js — flashcard exports and the whole-account backup format.
import { renderPinyin } from './pinyin.js';
import { SCHEMA } from './schema.js';

const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();
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
  const q = (s) => { const v = String(s ?? ''); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
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

// Validate a parsed backup and return the pieces of state it carries.
// `mode` 'replace' takes the file as the new truth; 'merge' keeps whatever is
// local and adds what the file has (a local entry wins on conflict).
export function applyBackup(local, parsed, mode = 'merge') {
  if (!parsed || typeof parsed !== 'object' || parsed.app !== 'zhongwen-enhanced' || !parsed.data) throw new Error('Not a Zhongwen Enhanced backup file.');
  const d = parsed.data;
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const arr = (x) => (Array.isArray(x) ? x : []);
  if (mode === 'replace') {
    return { vocab: obj(d.vocab), srs: obj(d.srs), sentences: arr(d.sentences), settings: obj(d.settings), stats: obj(d.stats), daily: d.daily || null, recent: arr(d.recent) };
  }
  const vocab = { ...obj(d.vocab), ...local.vocab };
  const srs = { ...obj(d.srs), ...local.srs };
  const seen = new Set(local.sentences.map((s) => s.id));
  const sentences = local.sentences.concat(arr(d.sentences).filter((s) => s && s.id && !seen.has(s.id))).sort((a, b) => b.addedAt - a.addedAt);
  const stats = { ...obj(d.stats) };
  for (const [k, v] of Object.entries(local.stats || {})) stats[k] = { ...(stats[k] || {}), ...v };
  return { vocab, srs, sentences, settings: local.settings, stats, daily: local.daily, recent: local.recent };
}
