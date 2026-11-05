// Sentences.jsx — saved sentences, grouped by where they came from. Open one
// for a word-by-word breakdown (segmented on demand), a note, audio.
import { useMemo, useState, useEffect } from 'preact/hooks';
import { api } from '../shared/api.js';
import { Hanzi, Pinyin } from '../components/Hanzi.jsx';
import { useToast, hostOf, fmtDate } from '../components/ui.jsx';
import { speak } from '../shared/tts.js';
import { go } from './route.js';

export function Sentences({ st }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [toastEl, toast] = useToast();
  const list = useMemo(() => st.sentences.filter((x) => !q || x.text.includes(q) || (x.note && x.note.includes(q)) || (x.title && x.title.toLowerCase().includes(q.toLowerCase()))), [st.sentences, q]);
  const groups = useMemo(() => { const m = new Map(); for (const x of list) { const k = x.title || hostOf(x.url) || 'Other'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return [...m.entries()]; }, [list]);
  if (!st.sentences.length) {
    return <div><div class="page-head"><h1>Sentences</h1></div><div class="empty"><div class="big">还没有句子</div>Select some Chinese on a page and press <kbd>t</kbd> (or right-click → Break down) to see it word by word, then save it here.</div></div>;
  }
  return (
    <div>
      <div class="page-head"><h1>Sentences</h1><span class="sub">{list.length}</span></div>
      <div class="toolbar"><input class="input" placeholder="Search sentences" value={q} onInput={(e) => setQ(e.currentTarget.value)} /></div>
      {groups.map(([title, items]) => (
        <div class="group" key={title}>
          <div class="group-head"><h2>{title}</h2><span class="n">{items.length}</span></div>
          <div class="list">
            {items.map((x) => <SentenceRow key={x.id} x={x} s={st.settings} open={open === x.id} onOpen={() => setOpen(open === x.id ? null : x.id)} toast={toast} />)}
          </div>
        </div>
      ))}
      {toastEl}
    </div>
  );
}

function SentenceRow({ x, s, open, onOpen, toast }) {
  const [tokens, setTokens] = useState(null);
  const [note, setNote] = useState(x.note || '');
  useEffect(() => { if (open && !tokens) api.segment(x.text).then((r) => setTokens(r.tokens)).catch(() => setTokens([])); }, [open]); // eslint-disable-line
  return (
    <>
      <div class={`vrow ${open ? 'open' : ''}`} style="grid-template-columns:1fr auto" onClick={onOpen}>
        <div class="sent" style="font-size:16px">{x.text}</div>
        <span class="due">{fmtDate(x.addedAt)}</span>
      </div>
      {open && (
        <div class="vdetail" style="padding-left:12px">
          {tokens ? <Breakdown tokens={tokens} s={s} /> : <div class="faint small">Breaking down…</div>}
          {x.url && <div class="src">From <a href={x.url} target="_blank" rel="noopener">{x.title || hostOf(x.url)}</a></div>}
          <textarea class="input" placeholder="Your note…" value={note} onInput={(e) => setNote(e.currentTarget.value)} onBlur={() => { if ((note || '') !== (x.note || '')) api.setSentenceNote(x.id, note).then(() => toast('Note saved')); }} />
          <div class="wrap">
            <button class="btn btn-sm" onClick={() => speak(x.text, { rate: s.ttsRate })}>Listen</button>
            <button class="btn btn-sm" onClick={() => navigator.clipboard.writeText(x.text).then(() => toast('Copied'))}>Copy</button>
            <button class="btn btn-sm btn-danger" onClick={() => { if (confirm('Remove this sentence?')) api.removeSentence(x.id).then(() => toast('Removed')); }}>Remove</button>
          </div>
        </div>
      )}
    </>
  );
}

// word-by-word gloss, shared with the in-page sentence panel's data shape
export function Breakdown({ tokens, s, onWord }) {
  return (
    <div class="wrap" style="gap:4px 2px;align-items:flex-start">
      {tokens.map((t, i) => t.text != null ? (
        <span key={i} class="zw-han" style="font-size:18px;padding:6px 2px;color:var(--zw-text-faint)">{t.text}</span>
      ) : (
        <button key={i} class="btn btn-quiet" style="flex-direction:column;align-items:flex-start;gap:0;padding:4px 7px;border-radius:10px;line-height:1.25" onClick={() => onWord ? onWord(t) : go('/dictionary', { q: t.simp || t.w })} title={t.gloss || ''}>
          <Hanzi text={s.script === 'trad' && t.trad ? t.trad : t.w} py={t.py} trad={s.script === 'trad' && !!t.trad} className="bd-w" />
          {t.py && <span class="small"><Pinyin py={t.py} style={s.pinyinStyle} /></span>}
          <span class="small faint" style="font-weight:500;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{t.gloss || '—'}</span>
        </button>
      ))}
    </div>
  );
}
