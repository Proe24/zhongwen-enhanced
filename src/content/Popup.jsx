// Popup.jsx — the in-page dictionary card. Shows the selected match (or the
// character the reader drilled into), chips for the other words that start at
// the same spot, a keyboard-hint strip, and a transient toast.
import { WordCard, charInfoFromMatch, leadForms } from '../components/WordCard.jsx';

const HINTS = [['n', 'next word'], ['b', 'back'], ['m', 'next char'], ['s', 'save'], ['a', 'listen'], ['c', 'copy'], ['t', 'sentence'], ['d', 'short/full'], ['space', 'pin'], ['esc', 'close']];

export function Popup({ cur, settings, vars, toast, message, actions }) {
  if (message) {
    return (
      <div class="zw-popup zw-popup-msg" style={vars}><div class="zw-msg">{message}</div></div>
    );
  }
  const base = cur.matches[cur.sel];
  const shown = cur.drill.length ? cur.drill[cur.drill.length - 1] : base;
  const prev = cur.drill.length > 1 ? cur.drill[cur.drill.length - 2] : base;
  const lead = (m) => leadForms(m.entry, m.word, settings.script).lead;
  return (
    <div class={`zw-popup ${cur.pinned ? 'zw-pinned' : ''}`} style={vars} role="dialog" aria-label="Chinese dictionary">
      {cur.drill.length > 0 ? (
        <div class="zw-alts">
          <button class="zw-chip zw-chip-back" onClick={actions.back} title="Back">‹ {lead(prev)}</button>
        </div>
      ) : cur.matches.length > 1 ? (
        <div class="zw-alts" title="Other words that start here (j / k)">
          {cur.matches.map((m, i) => (
            <button key={m.word} class={`zw-chip ${i === cur.sel ? 'zw-chip-on' : ''}`} onClick={() => actions.select(i)}>{lead(m)}</button>
          ))}
        </div>
      ) : null}
      <div class="zw-scroll">
        <WordCard match={shown} settings={settings} compact={cur.compact} charInfo={charInfoFromMatch(shown)} onDrill={actions.drill} onToggleSave={actions.save} onSpeak={actions.speak} onCopy={actions.copy} onSentence={actions.sentence} onMore={actions.compact} busy={cur.busy} />
      </div>
      {settings.showHints && (
        <div class="zw-hints">
          {HINTS.map(([k, l]) => <span key={k}><kbd>{k}</kbd> {l}</span>)}
        </div>
      )}
      {cur.pinned && <div class="zw-pin" title="Pinned — Esc or click outside to close">pinned</div>}
      {toast && <div class="zw-toast">{toast}</div>}
    </div>
  );
}
