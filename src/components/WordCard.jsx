// WordCard.jsx — one dictionary entry, the way the popup and the Library show
// it: the whole word first (tone-colored, pinyin, the other script, HSK), the
// senses of its main reading, the other readings, and a tappable character
// breakdown for compounds. Pure display; actions come in as callbacks.
import { Hanzi, Pinyin } from './Hanzi.jsx';
import { decodeEntry } from '../shared/dict.js';

// Which spelling leads. 'page' = as written on the page; 'simp'; 'trad'.
export function leadForms(entry, pageWord, script) {
  const simp = entry.simp;
  const trad = entry.trad || simp;
  let lead = simp;
  if (script === 'trad') lead = trad;
  else if (script === 'page' && pageWord && pageWord !== simp && pageWord === trad) lead = trad;
  const other = lead === simp ? (trad !== simp ? trad : '') : simp;
  return { lead, other, leadIsTrad: lead !== simp };
}

export const HSK_LABEL = (n) => (n >= 7 ? 'HSK 7–9' : n ? `HSK ${n}` : '');

export function FamBadge({ fam }) {
  if (!fam) return null;
  const label = { new: 'saved', learning: 'learning', young: 'young', mature: 'mature' }[fam] || 'saved';
  return <span class={`zw-badge zw-badge-fam zw-fam-${fam}`}>{label}</span>;
}

export function WordCard({ match, settings, compact = false, charInfo = null, onDrill, onToggleSave, onSpeak, onCopy, onSentence, onMore, busy = false, extra = null }) {
  const { entry, word, saved, fam, note } = match;
  const { lead, other, leadIsTrad } = leadForms(entry, word, settings.script);
  const primary = entry.readings[0];
  const others = entry.readings.slice(1);
  const chars = Array.from(lead);
  const compound = chars.length > 1;
  const style = settings.pinyinStyle;
  const senses = compact ? primary.defs.slice(0, 2) : primary.defs;
  return (
    <div class={`zw-card ${compact ? 'zw-compact' : ''}`}>
      <div class="zw-hero">
        <div class={`zw-hero-word ${chars.length > 4 ? 'zw-long' : ''}`}>
          <Hanzi text={lead} py={primary.py} trad={leadIsTrad} />
        </div>
        <div class="zw-hero-side">
          <div class="zw-hero-py"><Pinyin py={primary.py} style={style} /></div>
          <div class="zw-hero-meta">
            {other && <span class="zw-other"><span class="zw-other-label">{leadIsTrad ? '简' : '繁'}</span><Hanzi text={other} py={primary.py} trad={!leadIsTrad} /></span>}
            {settings.showHsk && entry.hsk ? <span class="zw-badge zw-badge-hsk">{HSK_LABEL(entry.hsk)}</span> : null}
            {saved && <FamBadge fam={fam} />}
          </div>
        </div>
      </div>

      <ol class={`zw-senses ${primary.defs.length > 1 ? '' : 'zw-single'}`}>
        {senses.map((d, i) => <li key={i}>{primary.defs.length > 1 && <span class="zw-n">{i + 1}</span>}<span>{d}</span></li>)}
        {compact && primary.defs.length > senses.length && <li class="zw-more-senses"><span class="zw-n">+</span><span>{primary.defs.length - senses.length} more</span></li>}
      </ol>

      {!compact && others.length > 0 && (
        <div class="zw-readings">
          {others.map((r, i) => (
            <div key={i} class="zw-reading">
              <div class="zw-reading-head">
                <Pinyin py={r.py} style={style} />
                {r.trad && r.trad !== entry.trad && <span class="zw-reading-trad">繁 <Hanzi text={r.trad} trad /></span>}
              </div>
              <div class="zw-reading-defs">{r.defs.join(' · ')}</div>
            </div>
          ))}
        </div>
      )}

      {!compact && compound && onDrill && (
        <div class="zw-section">
          <div class="zw-label">Characters</div>
          <div class="zw-chars">
            {chars.map((c, i) => <CharRow key={i} c={c} tone={primary.sylls[i] ? primary.sylls[i].tone : null} style={style} info={charInfo ? charInfo(c) : null} onDrill={onDrill} />)}
          </div>
        </div>
      )}

      {note && !compact && <div class="zw-note"><span class="zw-label">Your note</span>{note}</div>}

      {!compact && (
        <div class="zw-links">
          <a href={`https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=${encodeURIComponent(entry.simp)}`} target="_blank" rel="noopener">MDBG</a>
          <a href={`https://en.wiktionary.org/wiki/${encodeURIComponent(entry.simp)}`} target="_blank" rel="noopener">Wiktionary</a>
          <a href={`https://forvo.com/search/${encodeURIComponent(entry.simp)}/zh/`} target="_blank" rel="noopener">Forvo</a>
          <a href={`https://resources.allsetlearning.com/gramwiki/?search=${encodeURIComponent(entry.simp)}`} target="_blank" rel="noopener">Grammar wiki</a>
        </div>
      )}

      {extra}

      <div class="zw-actions">
        {onToggleSave && <button class={`zw-btn ${saved ? 'zw-btn-on' : 'zw-btn-primary'}`} onClick={onToggleSave} disabled={busy} title={saved ? 'Remove from vocabulary (S)' : 'Save with its sentence (S)'}>{saved ? '✓ Saved' : '+ Save'}</button>}
        {onSpeak && <button class="zw-btn" onClick={onSpeak} title="Listen (A)">Listen</button>}
        {onCopy && <button class="zw-btn" onClick={onCopy} title="Copy word, pinyin and meaning (C)">Copy</button>}
        {onSentence && <button class="zw-btn" onClick={onSentence} title="Break down the sentence (T)">Sentence</button>}
        {onMore && <button class="zw-btn zw-btn-quiet" onClick={onMore} title="Short / full entry (D)">{compact ? 'More' : 'Less'}</button>}
      </div>
    </div>
  );
}

// a character of a compound: glyph · pinyin · short gloss
function CharRow({ c, tone, style, info, onDrill }) {
  return (
    <button class="zw-char-row" onClick={() => onDrill(c)} title={`Look up ${c}`}>
      <span class={`zw-han zw-char-glyph ${tone != null ? `zw-t${tone}` : ''}`}>{c}</span>
      {info ? (
        <>
          <span class="zw-char-py"><Pinyin py={info.py} style={style} /></span>
          <span class="zw-char-gloss">{info.gloss}</span>
        </>
      ) : <span class="zw-char-gloss zw-faint">look up</span>}
      <span class="zw-chev">›</span>
    </button>
  );
}

// gloss characters straight from a loaded dict (Library); the popup gets the
// same shape from the service worker (match.chars)
export function charInfoFrom(dict) {
  return (c) => {
    const e = decodeEntry(dict, c);
    if (!e) return null;
    return { py: e.readings[0].py, gloss: e.readings[0].defs.slice(0, 2).join('; ') };
  };
}

export function charInfoFromMatch(match) {
  const map = new Map((match.chars || []).map((x) => [x.c, x]));
  return (c) => map.get(c) || null;
}
