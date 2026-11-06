// settings.js — user preferences: defaults + a validator that repairs any
// stored object into a complete, well-typed one.

export const DEFAULTS = {
  theme: 'auto', // 'auto' | 'light' | 'dark'
  tonePalette: 'warm', // 'warm' | 'vivid' | 'pastel' | 'pleco'
  toneColors: true, // color hanzi + pinyin by tone
  pinyinStyle: 'marks', // 'marks' | 'numbers' | 'zhuyin'
  script: 'page', // which form leads in the popup: 'page' (as written on the page) | 'simp' | 'trad'
  popupScale: 1, // 0.85 … 1.4
  hoverDelay: 60, // ms before a hover becomes a lookup
  trigger: 'hover', // 'hover' | 'alt' | 'ctrl' | 'shift' — hold a key to look up
  showHsk: true,
  showHints: true, // keyboard hint strip in the popup
  hoverCard: 'peek', // 'peek' (word · pinyin · two senses) | 'full' (the whole card) on hover
  expandKey: 'shift', // hold this key to expand a peek into the full card: 'shift' | 'alt' | 'ctrl'
  disabledSites: [], // hostnames where lookups stay off
  reviewNewPerDay: 20,
  reviewPerDay: 200,
  reviewContext: true, // show the saved sentence on a card
  reviewCloze: false, // blank the word out of its sentence on the front
  ttsRate: 0.9,
};

const ENUMS = {
  theme: ['auto', 'light', 'dark'],
  tonePalette: ['warm', 'vivid', 'pastel', 'pleco'],
  pinyinStyle: ['marks', 'numbers', 'zhuyin'],
  script: ['page', 'simp', 'trad'],
  trigger: ['hover', 'alt', 'ctrl', 'shift'],
  hoverCard: ['peek', 'full'],
  expandKey: ['shift', 'alt', 'ctrl'],
};
const NUM = { popupScale: [0.75, 1.6], hoverDelay: [0, 1000], reviewNewPerDay: [0, 999], reviewPerDay: [0, 9999], ttsRate: [0.5, 1.5] };

export function normalizeSettings(raw) {
  const s = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return s;
  for (const k of Object.keys(DEFAULTS)) {
    const v = raw[k];
    if (v === undefined) continue;
    if (ENUMS[k]) { if (ENUMS[k].includes(v)) s[k] = v; }
    else if (NUM[k]) { const n = Number(v); if (Number.isFinite(n)) s[k] = Math.min(NUM[k][1], Math.max(NUM[k][0], n)); }
    else if (typeof DEFAULTS[k] === 'boolean') s[k] = !!v;
    else if (Array.isArray(DEFAULTS[k])) s[k] = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : DEFAULTS[k];
  }
  // the key that expands a peek can't be the key that triggers a lookup
  if (s.expandKey === s.trigger) s.expandKey = s.trigger === 'shift' ? 'alt' : 'shift';
  return s;
}

export const siteDisabled = (settings, hostname) => !!hostname && (settings.disabledSites || []).includes(hostname);
