// pinyin.js — numbered pinyin ("chuan2 tong3") → tone marks, tone numbers,
// or zhuyin (bopomofo). Pure functions, no DOM.

const MARKS = {
  a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ',
};

// "cheng2" → { base: "cheng", tone: 2 }  ·  "nu:3" / "nv3" → { base: "nü", tone: 3 }
// "de5" → tone 0 (neutral). Tone-less input is treated as neutral.
export function splitSyllable(syll) {
  let s = String(syll || '').trim();
  let tone = 0;
  const m = /[1-5]$/.exec(s);
  if (m) {
    s = s.slice(0, -1);
    tone = m[0] === '5' ? 0 : Number(m[0]);
  }
  s = s.replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/v/g, 'ü').replace(/V/g, 'Ü');
  return { base: s, tone };
}

// Place the tone mark on the right vowel: a/e first; "ou" → o; otherwise the
// last vowel. Case of the first letter is preserved (proper nouns).
export function markSyllable(syll) {
  const { base, tone } = splitSyllable(syll);
  if (!tone) return base;
  const lower = base.toLowerCase();
  let idx = -1;
  if (lower.includes('a')) idx = lower.indexOf('a');
  else if (lower.includes('e')) idx = lower.indexOf('e');
  else if (lower.includes('ou')) idx = lower.indexOf('o');
  else for (let i = 0; i < lower.length; i++) if ('aeiouü'.includes(lower[i])) idx = i;
  if (idx < 0) return base;
  const v = base[idx];
  const marked = MARKS[v.toLowerCase()] ? MARKS[v.toLowerCase()][tone - 1] : v;
  const out = v === v.toUpperCase() && v !== v.toLowerCase() ? marked.toUpperCase() : marked;
  return base.slice(0, idx) + out + base.slice(idx + 1);
}

// "chuan2 tong3" → [{ base, tone, marks, num, zhuyin }, …]
export function syllables(pyNum) {
  return String(pyNum || '').split(/\s+/).filter(Boolean).map((s) => {
    const { base, tone } = splitSyllable(s);
    return { base, tone, marks: markSyllable(s), num: base + (tone || 5), zhuyin: toZhuyin(base, tone) };
  });
}

// Render a numbered reading in the chosen style: 'marks' | 'numbers' | 'zhuyin'.
// Returns an array of strings, one per syllable, so callers can tone-color each.
export function renderPinyin(pyNum, style = 'marks') {
  return syllables(pyNum).map((s) => (style === 'numbers' ? s.num : style === 'zhuyin' ? s.zhuyin : s.marks));
}

// Tones of a numbered reading, e.g. "ni3 hao3" → [3, 3]
export function tonesOf(pyNum) {
  return syllables(pyNum).map((s) => s.tone);
}

// ── zhuyin ───────────────────────────────────────────────────────────────────
const INITIALS = { b: 'ㄅ', p: 'ㄆ', m: 'ㄇ', f: 'ㄈ', d: 'ㄉ', t: 'ㄊ', n: 'ㄋ', l: 'ㄌ', g: 'ㄍ', k: 'ㄎ', h: 'ㄏ', j: 'ㄐ', q: 'ㄑ', x: 'ㄒ', zh: 'ㄓ', ch: 'ㄔ', sh: 'ㄕ', r: 'ㄖ', z: 'ㄗ', c: 'ㄘ', s: 'ㄙ' };
const FINALS = {
  a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ê: 'ㄝ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ', an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ', er: 'ㄦ',
  i: 'ㄧ', ia: 'ㄧㄚ', ie: 'ㄧㄝ', iao: 'ㄧㄠ', iu: 'ㄧㄡ', iou: 'ㄧㄡ', ian: 'ㄧㄢ', in: 'ㄧㄣ', iang: 'ㄧㄤ', ing: 'ㄧㄥ', iong: 'ㄩㄥ',
  u: 'ㄨ', ua: 'ㄨㄚ', uo: 'ㄨㄛ', uai: 'ㄨㄞ', ui: 'ㄨㄟ', uei: 'ㄨㄟ', uan: 'ㄨㄢ', un: 'ㄨㄣ', uen: 'ㄨㄣ', uang: 'ㄨㄤ', ong: 'ㄨㄥ', ueng: 'ㄨㄥ',
  ü: 'ㄩ', üe: 'ㄩㄝ', üan: 'ㄩㄢ', ün: 'ㄩㄣ',
};
// whole syllables spelled with y/w in pinyin
const STANDALONE = { yi: 'ㄧ', ya: 'ㄧㄚ', ye: 'ㄧㄝ', yao: 'ㄧㄠ', you: 'ㄧㄡ', yan: 'ㄧㄢ', yin: 'ㄧㄣ', yang: 'ㄧㄤ', ying: 'ㄧㄥ', yong: 'ㄩㄥ', wu: 'ㄨ', wa: 'ㄨㄚ', wo: 'ㄨㄛ', wai: 'ㄨㄞ', wei: 'ㄨㄟ', wan: 'ㄨㄢ', wen: 'ㄨㄣ', wang: 'ㄨㄤ', weng: 'ㄨㄥ', yu: 'ㄩ', yue: 'ㄩㄝ', yuan: 'ㄩㄢ', yun: 'ㄩㄣ', er: 'ㄦ', r: 'ㄦ', a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ê: 'ㄝ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ', an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ' };
const TONE_MARKS = { 0: '˙', 1: '', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ' };

// pinyin base ("zhong", "lü", "xue") + tone → zhuyin ("ㄓㄨㄥ", "ㄌㄩˋ"). Unknown
// syllables (m, ng, hm…) come back unchanged.
export function toZhuyin(base, tone = 0) {
  const s = String(base || '').toLowerCase();
  let body = null;
  if (STANDALONE[s]) body = STANDALONE[s];
  else {
    const init = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])/.exec(s);
    if (init) {
      const i = init[0];
      let fin = s.slice(i.length);
      // ü after j/q/x/y is written u in pinyin
      if ('jqx'.includes(i) && fin.startsWith('u')) fin = 'ü' + fin.slice(1);
      if (fin === 'i' && /^(zh|ch|sh|r|z|c|s)$/.test(i)) body = INITIALS[i]; // zhi, si… — the i is silent
      else if (FINALS[fin]) body = INITIALS[i] + FINALS[fin];
      else if (fin === '') body = INITIALS[i];
    }
  }
  if (body == null) return base;
  if (tone === 0) return TONE_MARKS[0] + body;
  return body + TONE_MARKS[tone];
}

// Strip diacritics and tone digits for search: "nǐ hǎo" / "ni3hao3" → "nihao".
export function plainPinyin(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/u\u0308/g, 'v')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/u:/g, 'v')
    .replace(/ü/g, 'v')
    .replace(/[^a-z]/g, '');
}
