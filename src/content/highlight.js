// highlight.js — mark the word under the cursor with the CSS Custom Highlight
// API: no DOM changes, no fight with the page's own selection. The ::highlight
// rule is added as an adopted stylesheet (CSP-proof), else a <style> element.
const NAME = 'zhongwen-enhanced';
let hl = null;
let sheet = null;
let styleEl = null;

export function highlightSupported() { return typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined'; }

const rule = (scheme) => `::highlight(${NAME}){background-color:${scheme === 'dark' ? 'rgba(224,121,91,0.42)' : 'rgba(224,121,91,0.30)'};}`;

export function ensureHighlightStyle(doc, scheme) {
  try {
    if ('adoptedStyleSheets' in doc && typeof CSSStyleSheet !== 'undefined') {
      if (!sheet) sheet = new CSSStyleSheet();
      sheet.replaceSync(rule(scheme));
      if (!doc.adoptedStyleSheets.includes(sheet)) doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
      return;
    }
  } catch { /* fall back to an element */ }
  if (!styleEl || !styleEl.isConnected) {
    styleEl = doc.createElement('style');
    styleEl.id = 'zhongwen-enhanced-hl';
    (doc.head || doc.documentElement).appendChild(styleEl);
  }
  styleEl.textContent = rule(scheme);
}

export function removeHighlightStyle(doc) {
  try { if (sheet && doc.adoptedStyleSheets.includes(sheet)) doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet); } catch { /* ignore */ }
  if (styleEl) { styleEl.remove(); styleEl = null; }
  if (hl) { hl.clear(); try { CSS.highlights.delete(NAME); } catch { /* ignore */ } hl = null; }
}

export function setHighlight(range) {
  if (!highlightSupported()) return;
  if (!hl) { hl = new Highlight(); CSS.highlights.set(NAME, hl); }
  hl.clear();
  if (range) hl.add(range);
}
export function clearHighlight() { if (hl) hl.clear(); }
