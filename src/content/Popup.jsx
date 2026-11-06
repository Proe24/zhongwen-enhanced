// Popup.jsx — the in-page dictionary card. Shows the selected match (or the
// character the reader drilled into), chips for the other words that start at
// the same spot, a keyboard-hint strip, and a transient toast.
import { WordCard, charInfoFromMatch, leadForms, HSK_LABEL, FamBadge } from '../components/WordCard.jsx';
import { Hanzi, Pinyin } from '../components/Hanzi.jsx';

const HINTS = [['n', 'next word'], ['b', 'back'], ['m', 'next char'], ['s', 'save'], ['a', 'listen'], ['c', 'copy'], ['t', 'sentence'], ['d', 'keep full'], ['space', 'pin'], ['esc', 'close']];
const KEY_NAME = { shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl' };

// the glance: word · pinyin · other script · HSK · two senses
function Peek({ m, settings, hint }) {
  const { lead, other, leadIsTrad } = leadForms(m.entry, m.word, settings.script);
  const r = m.entry.readings[0];
  return (
    <div class="zw-peek-card">
      <div class="zw-peek-head">
        <span class={`zw-peek-word ${Array.from(lead).length > 4 ? 'zw-long' : ''}`}><Hanzi text={lead} py={r.py} trad={leadIsTrad} /></span>
        <span class="zw-peek-side">
          <span class="zw-peek-py"><Pinyin py={r.py} style={settings.pinyinStyle} /></span>
          <span class="zw-peek-meta">
            {other && <span class="zw-other"><span class="zw-other-label">{leadIsTrad ? '简' : '繁'}</span><Hanzi text={other} py={r.py} trad={!leadIsTrad} /></span>}
            {settings.showHsk && m.entry.hsk ? <span class="zw-badge zw-badge-hsk">{HSK_LABEL(m.entry.hsk)}</span> : null}
            {m.saved && <FamBadge fam={m.fam} />}
          </span>
        </span>
      </div>
      <div class="zw-peek-defs">{r.defs.slice(0, 2).join(' · ')}{r.defs.length > 2 ? ' · …' : ''}{m.entry.readings.length > 1 ? <span class="zw-peek-more"> +{m.entry.readings.length - 1} reading{m.entry.readings.length > 2 ? 's' : ''}</span> : null}</div>
      {hint && <div class="zw-peek-hint">{hint}</div>}
    </div>
  );
}

export function Popup({ cur, settings, vars, toast, message, actions, expanded = true }) {
  if (message) {
    return (
      <div class="zw-popup zw-popup-msg" style={vars}><div class="zw-msg">{message}</div></div>
    );
  }
  const base = cur.matches[cur.sel];
  const shown = cur.drill.length ? cur.drill[cur.drill.length - 1] : base;
  const prev = cur.drill.length > 1 ? cur.drill[cur.drill.length - 2] : base;
  const lead = (m) => leadForms(m.entry, m.word, settings.script).lead;
  if (!expanded) {
    const hint = settings.showHints ? `hold ${KEY_NAME[settings.expandKey] || 'Shift'} for more · s save · space pin` : null;
    return (
      <div class="zw-popup zw-peek" style={vars} role="dialog" aria-label="Chinese dictionary">
        {cur.matches.length > 1 && (
          <div class="zw-alts" title="Other words that start here (j / k)">
            {cur.matches.map((m, i) => <button key={m.word} class={`zw-chip ${i === cur.sel ? 'zw-chip-on' : ''}`} onClick={() => actions.select(i)}>{lead(m)}</button>)}
          </div>
        )}
        <Peek m={base} settings={settings} hint={hint} />
        {toast && <div class="zw-toast">{toast}</div>}
      </div>
    );
  }
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
        <WordCard match={shown} settings={settings} charInfo={charInfoFromMatch(shown)} onDrill={actions.drill} onToggleSave={actions.save} onSpeak={actions.speak} onCopy={actions.copy} onSentence={actions.sentence} busy={cur.busy} />
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
