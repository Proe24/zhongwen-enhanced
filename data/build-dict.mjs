// build-dict.mjs — turn CC-CEDICT into the compact runtime table the service
// worker loads: public/dict/words.json.gz
//
//   node data/build-dict.mjs            (reads data/cedict_ts.u8)
//
// CC-CEDICT line:   傳統 传统 [chuan2 tong3] /tradition/convention/
//                   ^trad ^simp ^numbered pinyin  ^senses
//
// Output shape — one STRING per simplified headword, decoded on demand so the
// in-memory table stays small (a nested-object table costs ~3× the memory):
//
//   words["行"] = "xing2\t\tto walk/to go\u001ehang2\t\trow/profession"
//                  reading = pinyin \t traditional-if-different \t senses
//                  readings separated by \u001e, most useful first
//   words["傳統"] = "@传统"       ← a traditional alias: "look me up there"
//
// Readings are ordered by usefulness: more senses first, proper nouns
// (capitalised pinyin) last — so 都 → dōu wins over 都 → Dū.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const SRC = new URL('./cedict_ts.u8', import.meta.url);
const OUT_DIR = new URL('../public/dict/', import.meta.url);
const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/;
const MAX_SENSES = 14;
const MAX_DEF_CHARS = 300;

const text = readFileSync(SRC, 'utf8');
let version = '';
const bySimp = new Map();
for (const raw of text.split('\n')) {
  const line = raw.replace(/\r$/, '');
  if (!line) continue;
  if (line[0] === '#') {
    const m = /^#! (date|version)=(.*)$/.exec(line);
    if (m) version += `${m[1]}=${m[2]} `;
    continue;
  }
  const m = LINE.exec(line);
  if (!m) continue;
  const [, trad, simp, pyRaw, defRaw] = m;
  const py = pyRaw.replace(/\s+/g, ' ').trim();
  const senses = cleanSenses(defRaw);
  if (!senses.length) continue;
  let rec = bySimp.get(simp);
  if (!rec) bySimp.set(simp, (rec = []));
  rec.push({ py, trad: trad === simp ? '' : trad, senses });
}

function cleanSenses(defs) {
  const parts = defs.split('/').map((s) => s.trim()).filter(Boolean);
  const kept = [];
  let len = 0;
  for (const p of parts) {
    if (kept.length >= MAX_SENSES || len >= MAX_DEF_CHARS) break;
    kept.push(p);
    len += p.length + 1;
  }
  return kept;
}

const isProper = (py) => /^[A-Z]/.test(py);
const isPointer = (senses) => senses.length === 1 && /^(variant of|old variant of|see |see also |erhua variant of|Japanese variant of)/i.test(senses[0]);

const words = {};
for (const [simp, readings] of bySimp) {
  readings.sort((a, b) => score(b) - score(a));
  words[simp] = readings.map((r) => [r.py, r.trad, r.senses.join('/')].join('\t')).join('\u001e');
}
function score(r) {
  return r.senses.length - (isProper(r.py) ? 100 : 0) - (isPointer(r.senses) ? 50 : 0);
}

let aliases = 0;
for (const [simp, readings] of bySimp) {
  for (const r of readings) {
    if (!r.trad || r.trad === simp || words[r.trad]) continue;
    words[r.trad] = '@' + simp;
    aliases++;
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify({ v: 2, source: 'CC-CEDICT ' + version.trim(), words });
const gz = gzipSync(json, { level: 9 });
writeFileSync(new URL('words.json.gz', OUT_DIR), gz);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`headwords ${bySimp.size}, aliases ${aliases}, ${kb(json.length)} → ${kb(gz.length)} gz (${version.trim()})`);
