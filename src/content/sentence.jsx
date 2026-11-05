// sentence.jsx — the sentence panel: a selection (or the sentence around the
// hovered word) split into words, each with pinyin and a gloss; click a word
// for its full card; save the sentence; listen. Opens from `t`, the context
// menu, or `t` on a selection with no popup.
import { render } from 'preact';
import { api } from '../shared/api.js';
import { speak } from '../shared/tts.js';
import { Hanzi, Pinyin } from '../components/Hanzi.jsx';
import { WordCard, charInfoFromMatch } from '../components/WordCard.jsx';
import { ensureHost, isInsideHost, mountFor } from './host.jsx';
import { copyText } from '../shared/clipboard.js';

const MAX_CHARS = 1000; // a whole-page selection would stall the page and the worker

let st = null; // { text, tokens, sel, match, saved, toast, vars, settings }
let toastTimer = null;

export const sentencePanelOpen = () => !!st;

export function openSentencePanel(text, { vars = '', settings }) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || !/\p{Script=Han}/u.test(t)) return false;
  const truncated = t.length > MAX_CHARS;
  if (truncated) t = t.slice(0, MAX_CHARS);
  if (!st) {
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
  }
  st = { text: t, tokens: null, sel: null, match: null, saved: false, toast: null, vars, settings, truncated };
  paint();
  api.segment(t).then((r) => { if (st && st.text === t) { st.tokens = r.tokens; paint(); } }).catch(() => { if (st && st.text === t) { st.tokens = []; paint(); } });
  return true;
}

export function closeSentencePanel() {
  if (!st) return;
  st = null;
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('mousedown', onDown, true);
  render(null, mountFor('panel'));
}

// settings changed while open (theme, pinyin style…)
export function updateSentencePanel({ vars, settings }) { if (st) { st.vars = vars; st.settings = settings; paint(); } }

function onKey(e) {
  if (e.key === 'Escape') { closeSentencePanel(); e.preventDefault(); e.stopPropagation(); }
}
function onDown(e) { if (st && !isInsideHost(e.target)) closeSentencePanel(); }

function toast(text) {
  if (!st) return;
  st.toast = text;
  paint();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (st) { st.toast = null; paint(); } }, 1400);
}

function pick(i) {
  if (!st) return;
  const tok = st.tokens[i];
  if (!tok || tok.text != null) return;
  if (st.sel === i) { st.sel = null; st.match = null; paint(); return; }
  st.sel = i;
  st.match = null;
  paint();
  api.entry(tok.simp || tok.w).then((r) => { if (st && st.sel === i && r && r.match) { st.match = r.match; paint(); } }).catch(() => {});
}

function toggleWord() {
  const m = st && st.match;
  if (!m) return;
  const e = m.entry;
  const after = (saved, msg) => { if (!st || st.match !== m) return; m.saved = saved; m.fam = saved ? 'new' : null; for (const t of st.tokens) if (t.simp === e.simp) t.saved = saved; toast(msg); };
  if (m.saved) api.removeWord(e.simp).then(() => after(false, 'Removed')).catch(() => toast('Could not remove'));
  else api.saveWord({ w: e.simp, trad: e.trad, py: e.readings[0].py, def: e.readings[0].defs.slice(0, 3).join('; '), sent: st.text, url: location.href, title: document.title }).then(() => after(true, 'Saved with this sentence')).catch(() => toast('Could not save'));
}

function saveSentence() {
  if (!st || st.saved) return;
  api.saveSentence({ text: st.text, url: location.href, title: document.title }).then(() => { if (st) { st.saved = true; toast('Sentence saved'); } }).catch(() => toast('Could not save'));
}

function copyAll() {
  const lines = [st.text, (st.tokens || []).filter((t) => t.w).map((t) => `${t.w}\t${t.py || ''}\t${t.gloss || ''}`).join('\n')].join('\n');
  copyText(lines).then(() => toast('Copied'), () => toast('Could not copy'));
}

function Panel() {
  const s = st.settings;
  const trad = s.script === 'trad';
  return (
    <div class="zw-panel" style={st.vars} role="dialog" aria-label="Sentence">
      <div class="zw-panel-head">
        <span class="zw-label">Sentence · {st.tokens ? `${st.tokens.filter((t) => t.w).length} words` : 'breaking down…'}{st.truncated ? ` · first ${MAX_CHARS} characters` : ''}</span>
        <button class="zw-x" onClick={closeSentencePanel} title="Close (Esc)">×</button>
      </div>
      <div class="zw-panel-body">
        {st.tokens ? (
          <div class="zw-tokens">
            {st.tokens.map((t, i) => t.text != null ? <span key={i} class="zw-tok-text">{t.text}</span> : (
              <button key={i} class={`zw-tok ${st.sel === i ? 'zw-tok-on' : ''} ${t.saved ? 'zw-tok-saved' : ''}`} onClick={() => pick(i)} title={t.gloss || 'not in the dictionary'}>
                <Hanzi text={trad && t.trad ? t.trad : t.w} py={t.py} trad={trad && !!t.trad} className="zw-tok-w" />
                {t.py && <span class="zw-tok-py"><Pinyin py={t.py} style={s.pinyinStyle} /></span>}
                <span class="zw-tok-gloss">{t.gloss || '—'}</span>
              </button>
            ))}
          </div>
        ) : <div class="zw-faint-text" style="padding:10px 0">{st.text}</div>}
        {st.sel != null && (
          <div class="zw-panel-word">
            {st.match ? <WordCard match={st.match} settings={s} charInfo={charInfoFromMatch(st.match)} onDrill={(c) => api.entry(c).then((r) => { if (st && r.match) { st.match = r.match; paint(); } }).catch(() => {})} onToggleSave={toggleWord} onSpeak={() => speak(st.match.entry.simp, { rate: s.ttsRate })} /> : <div class="zw-faint-text" style="padding:10px 0">Looking up…</div>}
          </div>
        )}
      </div>
      <div class="zw-panel-actions">
        <button class={`zw-btn ${st.saved ? 'zw-btn-on' : 'zw-btn-primary'}`} onClick={saveSentence}>{st.saved ? '✓ Sentence saved' : '+ Save sentence'}</button>
        <button class="zw-btn" onClick={() => { if (!speak(st.text, { rate: s.ttsRate })) toast('No Chinese voice on this device'); }}>Listen</button>
        <button class="zw-btn" onClick={copyAll}>Copy</button>
        <button class="zw-btn zw-btn-quiet" onClick={() => api.openApp('/sentences')}>Library</button>
        <span class="zw-faint-text" style="margin-left:auto">click a word · esc closes</span>
        {st.toast && <div class="zw-toast">{st.toast}</div>}
      </div>
    </div>
  );
}

function paint() { if (st) { ensureHost(); render(<Panel />, mountFor('panel')); } }
