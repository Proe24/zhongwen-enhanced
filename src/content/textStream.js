// textStream.js — reading characters out of the page. A "stream" is the
// visible characters of one block-level element, in order, each remembering
// the text node and offset it came from, so a word found in the stream can
// be turned back into a DOM Range (for the highlight and the popup anchor).

const ZERO_WIDTH = /[​‌‍﻿­]/;
const SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION|RT|RP|SVG|CANVAS|VIDEO|AUDIO|IFRAME)$/;
const BLOCK_DISPLAY = /^(block|flex|grid|list-item|table|table-cell|table-row|table-caption|flow-root|inline-block|inline-flex|inline-grid|inline-table)$/;
const HAN = /\p{Script=Han}/u;
const WORD_CHAR = /[\p{Script=Han}A-Za-z0-9·]/u; // what a headword can contain (T恤, 卡拉OK, AA制)
const SENTENCE_END = /[。！？!?；;…\n\r]/;

export const isHan = (c) => HAN.test(c);

// nearest block-level ancestor (where a line of running text starts and ends)
export function blockOf(node) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const doc = el && el.ownerDocument;
  while (el && el !== doc.body && el !== doc.documentElement) {
    let d = '';
    try { d = getComputedStyle(el).display; } catch { /* detached */ }
    if (BLOCK_DISPLAY.test(d) || el.tagName === 'P' || el.tagName === 'DIV' || el.tagName === 'LI' || el.tagName === 'TD') return el;
    el = el.parentElement;
  }
  return el || doc.body || doc.documentElement;
}

function visible(el, cache) {
  if (!el) return true;
  if (cache.has(el)) return cache.get(el);
  let ok = true;
  if (SKIP_TAGS.test(el.tagName)) ok = false;
  else {
    try { const cs = getComputedStyle(el); ok = cs.display !== 'none' && cs.visibility !== 'hidden'; } catch { ok = true; }
    if (ok && el.parentElement) ok = visible(el.parentElement, cache);
  }
  cache.set(el, ok);
  return ok;
}

// [{ node, off, ch }] for every visible character in `block` (capped)
export function streamOf(block, limit = 60000) {
  const doc = block.ownerDocument;
  const cache = new Map();
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && !SKIP_TAGS.test(n.parentElement.tagName) && visible(n.parentElement, cache) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const out = [];
  let n;
  while ((n = walker.nextNode())) {
    const t = n.data;
    for (let i = 0; i < t.length; i++) {
      const code = t.charCodeAt(i);
      let ch = t[i];
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < t.length) { ch = t.slice(i, i + 2); }
      if (!ZERO_WIDTH.test(ch)) out.push({ node: n, off: i, ch });
      i += ch.length - 1;
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function indexInStream(stream, node, off) {
  for (let i = 0; i < stream.length; i++) {
    const s = stream[i];
    if (s.node === node && off >= s.off && off < s.off + s.ch.length) return i;
  }
  // caret just after the last char of a node → that char
  for (let i = stream.length - 1; i >= 0; i--) if (stream[i].node === node && off === stream[i].off + stream[i].ch.length) return i;
  return -1;
}

// up to `max` word characters starting at index i
export function textFrom(stream, i, max) {
  let s = '';
  for (let k = i; k < stream.length && k < i + max; k++) {
    if (!WORD_CHAR.test(stream[k].ch)) break;
    s += stream[k].ch;
  }
  return s;
}

export function rangeFor(stream, i, len) {
  const a = stream[i];
  const b = stream[Math.min(stream.length - 1, i + len - 1)];
  const r = a.node.ownerDocument.createRange();
  r.setStart(a.node, a.off);
  r.setEnd(b.node, b.off + b.ch.length);
  return r;
}

// the sentence around [i, i+len): back to the previous terminator, forward
// through the next one (capped either side so a wall of text stays a sentence)
export function sentenceAround(stream, i, len, cap = 140) {
  let a = i;
  while (a > 0 && i - a < cap && !SENTENCE_END.test(stream[a - 1].ch)) a--;
  let b = i + len;
  while (b < stream.length && b - i < cap && !SENTENCE_END.test(stream[b].ch)) b++;
  if (b < stream.length && SENTENCE_END.test(stream[b].ch) && stream[b].ch !== '\n' && stream[b].ch !== '\r') b++;
  let s = '';
  for (let k = a; k < b; k++) s += stream[k].ch;
  return s.replace(/\s+/g, ' ').trim();
}

// the DOM caret under a viewport point → { node, offset } for a TEXT node whose
// character box actually contains the point, else null (margins, gaps, images)
export function caretAt(doc, x, y) {
  let node = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (!p) return null;
    node = p.offsetNode;
    offset = p.offset;
  } else if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (!r) return null;
    node = r.startContainer;
    offset = r.startOffset;
  } else return null;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const len = node.data.length;
  const data = node.data;
  const hit = (o) => {
    if (o < 0 || o >= len) return false;
    // probe the whole code point, not half of a surrogate pair
    const code = data.charCodeAt(o);
    if (code >= 0xdc00 && code <= 0xdfff) o -= 1; // low surrogate → start at the high one
    const end = Math.min(len, o + (data.charCodeAt(o) >= 0xd800 && data.charCodeAt(o) <= 0xdbff ? 2 : 1));
    const r = doc.createRange();
    r.setStart(node, o);
    r.setEnd(node, end);
    const rect = r.getBoundingClientRect();
    return rect.width > 0 && x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1;
  };
  if (hit(offset)) return { node, offset };
  if (hit(offset - 1)) return { node, offset: offset - 1 };
  if (hit(offset - 2)) return { node, offset: offset - 2 }; // caret after a surrogate pair
  return null;
}

// next / previous Han character in document order starting outside `block`
export function nextHanNode(doc, fromNode, forward) {
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && !SKIP_TAGS.test(n.parentElement.tagName) && HAN.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  walker.currentNode = fromNode;
  let n;
  while ((n = forward ? walker.nextNode() : walker.previousNode())) {
    if (n === fromNode) continue;
    let ok = true;
    try { const cs = getComputedStyle(n.parentElement); ok = cs.display !== 'none' && cs.visibility !== 'hidden'; } catch { /* ignore */ }
    if (ok) return n;
  }
  return null;
}
