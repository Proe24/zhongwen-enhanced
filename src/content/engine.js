// engine.js — the hover/keyboard state machine behind the popup.
//
//   mousemove ─(delay)─▶ caretAt ─▶ stream/idx ─▶ lookup ─▶ show
//   keys: n/b/m move · s save · a listen · c copy · t sentence · d short/full
//         j/k pick a shorter/longer match · space pin · esc close
//
// One `cur` object holds everything about the word on screen; `cfg` holds the
// live settings. Nothing here touches storage directly — the service worker does.
import { api } from '../shared/api.js';
import { tokensFor, cssVars } from '../shared/theme.js';
import { speak } from '../shared/tts.js';
import { MAX_WORD } from '../shared/dict.js';
import { renderPinyin } from '../shared/pinyin.js';
import * as T from './textStream.js';
import { setHighlight, clearHighlight, ensureHighlightStyle } from './highlight.js';
import { renderInto, unmountAll, isInsideHost, q } from './host.jsx';
import { Popup } from './Popup.jsx';
import { leadForms } from '../components/WordCard.jsx';
import { openSentencePanel, sentencePanelOpen, updateSentencePanel } from './sentence.jsx';

export const cfg = { enabled: false, settings: null, scheme: 'light', siteOff: false };
let attached = false;
let cur = null;
let message = null; // a short status shown instead of a card ("Loading dictionary…")
let hoverTimer = null;
let hideTimer = null;
let countTimer = null;
let toastTimer = null;
let lookupSeq = 0;
let toast = null;
const mouse = { x: -1, y: -1 };
let vars = '';

const active = () => cfg.enabled && cfg.settings && !cfg.siteOff;

export function configure(patch) {
  Object.assign(cfg, patch);
  if (cfg.settings) vars = cssVars(tokensFor(cfg.settings, cfg.scheme), cfg.settings.popupScale);
  ensureHighlightStyle(document, cfg.scheme);
  if (active() && !attached) attach();
  if (!active() && attached) detach();
  if (cur) { cur.compact = cur.userCompact != null ? cur.userCompact : cfg.settings.compact; rerender(); }
  if (cfg.settings) updateSentencePanel({ vars, settings: cfg.settings });
}

// open the sentence panel for any text (the context menu, a selection)
export function openSentence(text) {
  if (!cfg.settings) return false;
  const ok = openSentencePanel(text, { vars, settings: cfg.settings });
  if (ok) hide();
  return ok;
}

function attach() {
  attached = true;
  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('blur', onBlur);
}
function detach() {
  attached = false;
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mousedown', onDown, true);
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('keyup', onKeyUp, true);
  document.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onScroll);
  window.removeEventListener('blur', onBlur);
  hide();
}

// ── pointer ──────────────────────────────────────────────────────────────────
function triggerHeld(e) {
  const t = cfg.settings.trigger;
  return t === 'hover' || (t === 'alt' && e.altKey) || (t === 'ctrl' && e.ctrlKey) || (t === 'shift' && e.shiftKey);
}

function onMove(e) {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  if (isInsideHost(e.target)) { clearTimeout(hoverTimer); clearTimeout(hideTimer); return; }
  if (cur && cur.pinned) return;
  if (sentencePanelOpen()) return;
  if (!triggerHeld(e)) { if (cur) scheduleHide(); return; }
  if (cur && inCorridor(e.clientX, e.clientY)) { clearTimeout(hideTimer); return; }
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => lookupAt(e.clientX, e.clientY), cfg.settings.hoverDelay);
}

// the space between the word and its popup: crossing it must not re-trigger
function inCorridor(x, y) {
  if (!cur || !cur.wordBox || !cur.popBox) return false;
  const w = cur.wordBox;
  const p = cur.popBox;
  const pad = 6;
  const left = Math.min(w.left, p.left) - pad;
  const right = Math.max(w.right, p.right) + pad;
  const top = Math.min(w.top, p.top) - pad;
  const bottom = Math.max(w.bottom, p.bottom) + pad;
  return x >= left && x <= right && y >= top && y <= bottom;
}

function lookupAt(x, y) {
  if (!active()) return;
  const pos = T.caretAt(document, x, y);
  if (!pos) return scheduleHide();
  const block = T.blockOf(pos.node);
  const stream = cur && cur.block === block && Date.now() - cur.streamAt < 1500 ? cur.stream : T.streamOf(block);
  const idx = T.indexInStream(stream, pos.node, pos.offset);
  if (idx < 0 || !T.isHan(stream[idx].ch)) return scheduleHide();
  if (cur && cur.block === block && cur.idx === idx) { clearTimeout(hideTimer); return; }
  lookupFrom(block, stream, idx, {});
}

function lookupFrom(block, stream, idx, opts) {
  const text = T.textFrom(stream, idx, MAX_WORD);
  if (!text) return scheduleHide();
  const seq = ++lookupSeq;
  const slow = setTimeout(() => { if (seq === lookupSeq && !cur) showMessage('Loading dictionary…'); }, 600);
  api.lookup(text).then((res) => {
    clearTimeout(slow);
    if (seq !== lookupSeq) return;
    if (!res || !res.matches || !res.matches.length) return opts.keep ? null : scheduleHide();
    clearTimeout(hideTimer);
    const pinned = opts.pinned != null ? opts.pinned : !!(cur && cur.pinned);
    cur = { block, stream, streamAt: Date.now(), idx, text, matches: res.matches, sel: 0, pinned, drill: [], compact: cur && cur.userCompact != null ? cur.userCompact : cfg.settings.compact, userCompact: cur ? cur.userCompact : null, navigated: !!opts.navigated, busy: false };
    message = null;
    show();
  }).catch(() => { clearTimeout(slow); if (seq === lookupSeq) showMessage('Dictionary unavailable — try reloading the extension.'); });
}

function show() {
  const m = cur.matches[cur.sel];
  const range = T.rangeFor(cur.stream, cur.idx, m.len);
  cur.range = range;
  setHighlight(range);
  measureWord();
  if (cur.navigated) scrollWordIntoView();
  rerender();
  scheduleCount();
}

function measureWord() {
  const rects = cur.range.getClientRects();
  cur.wordRect = rects.length ? rects[0] : cur.range.getBoundingClientRect();
  cur.wordBox = cur.range.getBoundingClientRect();
}

function scrollWordIntoView() {
  const r = cur.wordBox;
  const vh = window.innerHeight;
  if (r.top < 40 || r.bottom > vh - 160) {
    window.scrollBy({ top: r.top - vh / 3, behavior: 'instant' });
    measureWord();
  }
}

function rerender() {
  if (!cur && !message) return;
  renderInto(Popup({ cur, settings: cfg.settings, vars, toast, message, actions }));
  place();
}

function place() {
  const el = q('.zw-popup');
  if (!el) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 8;
  const margin = 8;
  const r = cur ? cur.wordRect : { left: mouse.x, right: mouse.x, top: mouse.y, bottom: mouse.y };
  // lengths set on the element are multiplied by its CSS zoom, so divide them out
  const scale = cfg.settings.popupScale || 1;
  el.style.maxHeight = '';
  const box = el.getBoundingClientRect();
  const w = box.width;
  const h = box.height;
  const below = vh - margin - (r.bottom + gap); // room under the word
  const above = r.top - gap - margin; // room over it
  let top;
  let maxH = null;
  if (h <= below) top = r.bottom + gap;
  else if (h <= above) top = r.top - gap - h;
  else if (below >= above) { top = r.bottom + gap; maxH = below; } // never cover the word: shrink and scroll
  else { maxH = above; top = r.top - gap - Math.min(h, maxH); }
  const left = Math.max(margin, Math.min(r.left, vw - margin - w));
  el.style.top = `${Math.round(top / scale)}px`;
  el.style.left = `${Math.round(left / scale)}px`;
  if (maxH != null) el.style.maxHeight = `${Math.max(140, Math.floor(maxH / scale))}px`;
  if (cur) cur.popBox = el.getBoundingClientRect();
}

function showMessage(text) {
  message = text;
  renderInto(Popup({ cur: null, settings: cfg.settings, vars, toast: null, message, actions }));
  place();
  setTimeout(() => { if (message === text && !cur) hide(); }, 2500);
}

export function hide() {
  clearTimeout(hoverTimer);
  clearTimeout(hideTimer);
  clearTimeout(countTimer);
  clearHighlight();
  unmountAll();
  cur = null;
  message = null;
}
function scheduleHide(ms = 140) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (cur && !cur.pinned) hide(); else if (!cur && message) hide(); }, ms);
}

function scheduleCount() {
  clearTimeout(countTimer);
  countTimer = setTimeout(() => { if (cur) api.countLookup(shownMatch().entry.simp).catch(() => {}); }, 900);
}

function onScroll() {
  if (!cur) return;
  requestAnimationFrame(() => {
    if (!cur) return;
    measureWord();
    const r = cur.wordBox;
    if (!cur.pinned && (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth)) return hide();
    place();
  });
}
function onBlur() { if (cur && !cur.pinned) hide(); }

function pointInWord(x, y) {
  if (!cur || !cur.range) return false;
  for (const r of cur.range.getClientRects()) if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  return false;
}
function onDown(e) {
  if (isInsideHost(e.target)) return;
  if (!cur) return;
  if (e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && pointInWord(e.clientX, e.clientY)) {
    cur.pinned = !cur.pinned;
    rerender();
    e.preventDefault();
    return;
  }
  if (cur.pinned) hide();
}

// ── keyboard ─────────────────────────────────────────────────────────────────
const editable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const MOD_KEYS = { alt: 'Alt', ctrl: 'Control', shift: 'Shift' };

function onKey(e) {
  const trig = cfg.settings.trigger;
  if (trig !== 'hover' && e.key === MOD_KEYS[trig] && !cur && mouse.x >= 0) { lookupAt(mouse.x, mouse.y); return; }
  if (editable(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
  if (!cur) {
    // `t` with text selected on the page and no popup: break the selection down
    if (e.key.toLowerCase() === 't' && !sentencePanelOpen()) {
      const sel = String(window.getSelection && window.getSelection());
      if (sel.trim() && openSentence(sel)) { e.preventDefault(); e.stopPropagation(); }
    }
    return;
  }
  const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
  const fn = KEYS[k];
  if (!fn) return;
  fn();
  e.preventDefault();
  e.stopPropagation();
}
function onKeyUp(e) {
  const trig = cfg.settings.trigger;
  if (trig !== 'hover' && e.key === MOD_KEYS[trig] && cur && !cur.pinned) hide();
}

const KEYS = {
  escape: () => hide(),
  n: () => move(cur.idx + cur.matches[cur.sel].len, +1),
  m: () => move(cur.idx + 1, +1),
  b: () => move(cur.idx - 1, -1),
  s: () => actions.save(),
  a: () => actions.speak(),
  c: () => actions.copy(),
  t: () => actions.sentence(),
  d: () => actions.compact(),
  space: () => { cur.pinned = !cur.pinned; rerender(); },
  j: () => actions.select(Math.min(cur.matches.length - 1, cur.sel + 1)),
  k: () => actions.select(Math.max(0, cur.sel - 1)),
  '?': () => api.setSettings({ showHints: !cfg.settings.showHints }).catch(() => {}),
};

// move the cursor to the next Han character at/after `idx` (dir +1) or at/before (dir -1),
// crossing into the next block when this one runs out
function move(idx, dir) {
  const { stream, block } = cur;
  let i = idx;
  while (i >= 0 && i < stream.length && !T.isHan(stream[i].ch)) i += dir;
  if (i >= 0 && i < stream.length) {
    cur.idx = i;
    cur.navigated = true;
    return lookupFrom(block, stream, i, { keep: true, pinned: cur.pinned, navigated: true });
  }
  const edge = dir > 0 ? stream[stream.length - 1] : stream[0];
  const node = edge && T.nextHanNode(document, edge.node, dir > 0);
  if (!node) return;
  const nb = T.blockOf(node);
  const ns = T.streamOf(nb);
  let j = dir > 0 ? ns.findIndex((s) => T.isHan(s.ch)) : (() => { for (let k = ns.length - 1; k >= 0; k--) if (T.isHan(ns[k].ch)) return k; return -1; })();
  if (j < 0) return;
  lookupFrom(nb, ns, j, { keep: true, pinned: cur.pinned, navigated: true });
}

// ── actions (buttons + keys) ─────────────────────────────────────────────────
const shownMatch = () => (cur.drill.length ? cur.drill[cur.drill.length - 1] : cur.matches[cur.sel]);

function showToast(text) {
  toast = text;
  rerender();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = null; rerender(); }, 1400);
}

export const actions = {
  select(i) { if (!cur || i === cur.sel) return; cur.sel = i; cur.drill = []; show(); },
  back() { if (!cur) return; cur.drill.pop(); rerender(); },
  drill(c) {
    if (!cur) return;
    api.entry(c).then((res) => { if (cur && res && res.match) { cur.drill.push(res.match); cur.pinned = true; rerender(); } }).catch(() => {});
  },
  save() {
    if (!cur || cur.busy) return;
    const m = shownMatch();
    const e = m.entry;
    cur.busy = true;
    rerender();
    const done = (saved, text) => { if (!cur) return; m.saved = saved; m.fam = saved ? 'new' : null; cur.busy = false; showToast(text); };
    if (m.saved) api.removeWord(e.simp).then(() => done(false, 'Removed from vocabulary')).catch(() => done(true, 'Could not remove'));
    else {
      const sent = cur.drill.length ? T.sentenceAround(cur.stream, cur.idx, cur.matches[cur.sel].len) : T.sentenceAround(cur.stream, cur.idx, m.len);
      api.saveWord({ w: e.simp, trad: e.trad, py: e.readings[0].py, def: e.readings[0].defs.slice(0, 3).join('; '), sent, url: location.href, title: document.title })
        .then(() => done(true, 'Saved with its sentence')).catch(() => done(false, 'Could not save'));
    }
  },
  speak() {
    if (!cur) return;
    const m = shownMatch();
    const ok = speak(leadForms(m.entry, m.word, cfg.settings.script).lead, { rate: cfg.settings.ttsRate });
    if (!ok) showToast('No Chinese voice on this device');
  },
  copy() {
    if (!cur) return;
    const m = shownMatch();
    const r = m.entry.readings[0];
    const text = `${leadForms(m.entry, m.word, cfg.settings.script).lead}\t${renderPinyin(r.py, 'marks').join(' ')}\t${r.defs.join('; ')}`;
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Copied');
      } catch { showToast('Could not copy'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => showToast('Copied'), fallback);
    else fallback();
  },
  sentence() {
    if (!cur) return;
    const sel = String(window.getSelection && window.getSelection()).trim();
    openSentence(sel && /\p{Script=Han}/u.test(sel) ? sel : T.sentenceAround(cur.stream, cur.idx, cur.matches[cur.sel].len, 300));
  },
  compact() { if (!cur) return; cur.compact = !cur.compact; cur.userCompact = cur.compact; rerender(); },
};

export const isShowing = () => !!cur;
