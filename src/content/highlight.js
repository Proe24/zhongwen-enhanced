// highlight.js — mark the word under the cursor with the CSS Custom Highlight
// API: no DOM changes, no fight with the page's own selection.
const NAME = 'zhongwen-enhanced';
let hl = null;

export function highlightSupported() { return typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined'; }

export function ensureHighlightStyle(doc, scheme) {
  let st = doc.getElementById('zhongwen-enhanced-hl');
  if (!st) {
    st = doc.createElement('style');
    st.id = 'zhongwen-enhanced-hl';
    (doc.head || doc.documentElement).appendChild(st);
  }
  const bg = scheme === 'dark' ? 'rgba(224,121,91,0.42)' : 'rgba(224,121,91,0.30)';
  st.textContent = `::highlight(${NAME}){background-color:${bg};}`;
}

export function setHighlight(range) {
  if (!highlightSupported()) return;
  if (!hl) { hl = new Highlight(); CSS.highlights.set(NAME, hl); }
  hl.clear();
  if (range) hl.add(range);
}
export function clearHighlight() { if (hl) hl.clear(); }
