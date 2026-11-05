// ui.jsx — small shared controls, plus the state hook every page uses.
import { useEffect, useState, useCallback } from 'preact/hooks';
import { api } from '../shared/api.js';
import { tokensFor, cssVars, resolveScheme } from '../shared/theme.js';
import { Hanzi, Pinyin } from './Hanzi.jsx';
import { renderPinyin } from '../shared/pinyin.js';

// Live extension state: fetched once, refreshed whenever storage changes.
export function useAppState() {
  const [st, setSt] = useState(null);
  const [error, setError] = useState(null);
  const refresh = useCallback(() => api.state().then(setSt, (e) => setError(e.message)), []);
  useEffect(() => {
    refresh();
    const h = (changes, area) => { if (area === 'local') refresh(); };
    chrome.storage.onChanged.addListener(h);
    return () => chrome.storage.onChanged.removeListener(h);
  }, [refresh]);
  // theme: apply the tokens to <html> so every page shares the palette
  useEffect(() => {
    if (!st) return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.style.cssText = cssVars(tokensFor(st.settings, resolveScheme(st.settings.theme, mq.matches))); };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [st]);
  return { st, error, refresh };
}

export function Switch({ on, onChange, label }) {
  return <button class={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Seg({ value, options, onChange }) {
  return (
    <div class="seg" role="radiogroup">
      {options.map(([v, label]) => <button key={v} class={v === value ? 'on' : ''} role="radio" aria-checked={v === value} onClick={() => onChange(v)}>{label}</button>)}
    </div>
  );
}

// a compact one-line word row: hanzi · pinyin · gloss (+ optional right side)
export function WordRow({ word, trad, py, gloss, style = 'marks', leadTrad = false, saved = false, right = null, onClick }) {
  const lead = leadTrad && trad ? trad : word;
  return (
    <button class="wrow" onClick={onClick}>
      <span class="w"><Hanzi text={lead} py={py} trad={leadTrad && !!trad} /></span>
      <span class="meta">{py && <Pinyin py={py} style={style} />}{py && gloss ? ' · ' : ''}{gloss}</span>
      {saved && <span class="badge badge-good" title="In your vocabulary">saved</span>}
      {right}
    </button>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((text) => { setToast(text); setTimeout(() => setToast((t) => (t === text ? null : t)), 1600); }, []);
  return [toast ? <div class="toast">{toast}</div> : null, show];
}

export const pyMarks = (py) => renderPinyin(py, 'marks').join(' ');

// download a text file
export function downloadText(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
