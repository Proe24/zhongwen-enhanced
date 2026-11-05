// build-hsk.mjs — public/dict/hsk.json.gz: word → HSK 3.0 level (1–6, 7 = the
// combined 7–9 band). Source: github.com/drkameleon/complete-hsk-vocabulary (MIT).
// Both scripts are keyed. ~11k words, ~70 KB gzipped.
//
//   node data/build-hsk.mjs
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SRC = (lvl) => `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/new/${lvl}.min.json`;
const map = {};
for (const lvl of [1, 2, 3, 4, 5, 6, 7]) {
  const res = await fetch(SRC(lvl));
  if (!res.ok) throw new Error(`level ${lvl}: HTTP ${res.status}`);
  const entries = await res.json();
  for (const e of entries) {
    if (!e || !e.s) continue;
    if (!(e.s in map)) map[e.s] = lvl;
    for (const f of e.f || []) if (f.t && f.t !== e.s && !(f.t in map)) map[f.t] = lvl;
  }
  console.log(`level ${lvl}: ${entries.length} entries`);
}
const json = JSON.stringify(map);
const gz = gzipSync(Buffer.from(json), { level: 9 });
writeFileSync(new URL('../public/dict/hsk.json.gz', import.meta.url), gz);
console.log(`hsk.json.gz: ${Object.keys(map).length} words, ${gz.length} B gz`);
