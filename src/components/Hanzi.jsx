// Hanzi.jsx — characters colored by tone, and pinyin colored per syllable.
import { renderPinyin, tonesOf } from '../shared/pinyin.js';

// Tones for each character of `text` given its reading; null when they don't line up.
export function charTones(text, py) {
  const chars = Array.from(text);
  const tones = tonesOf(py);
  return tones.length === chars.length ? tones : null;
}

export function Hanzi({ text, py, tones = null, className = '', trad = false }) {
  const chars = Array.from(text || '');
  const t = tones || (py ? charTones(text, py) : null);
  return (
    <span class={`zw-han ${trad ? 'zw-han-trad' : ''} ${className}`} lang={trad ? 'zh-Hant' : 'zh-Hans'}>
      {chars.map((c, i) => <span key={i} class={t ? `zw-t${t[i]}` : ''}>{c}</span>)}
    </span>
  );
}

export function Pinyin({ py, style = 'marks', className = '' }) {
  const parts = renderPinyin(py, style);
  const tones = tonesOf(py);
  const sep = style === 'marks' ? '' : ' ';
  return (
    <span class={`zw-py ${className}`}>
      {parts.map((p, i) => <span key={i} class={`zw-t${tones[i]}`}>{i ? sep : ''}{p}</span>)}
    </span>
  );
}
