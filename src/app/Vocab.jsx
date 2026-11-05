// Vocab.jsx — every saved word: search, sort, group by where it came from,
// open one for its sentence/note/actions, export the current view.
import { useMemo, useState } from 'preact/hooks';
import { api } from '../shared/api.js';
import { Hanzi, Pinyin } from '../components/Hanzi.jsx';
import { Seg, useToast, downloadText, hostOf, fmtDate } from '../components/ui.jsx';
import { plainPinyin } from '../shared/pinyin.js';
import { dueLabel, dueAt, reviewed, familiarity } from '../shared/fsrs.js';
import { go } from './route.js';
import { speak } from '../shared/tts.js';

const matches = (e, q) => {
  if (!q) return true;
  const ql = q.toLowerCase();
  return e.w.includes(q) || (e.trad && e.trad.includes(q)) || plainPinyin(e.py).includes(plainPinyin(q)) || e.def.toLowerCase().includes(ql) || (e.sent && e.sent.includes(q)) || (e.note && e.note.toLowerCase().includes(ql));
};

export function Vocab({ st }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [grouped, setGrouped] = useState(true);
  const [open, setOpen] = useState(null);
  const [menu, setMenu] = useState(false);
  const [toastEl, toast] = useToast();
  const s = st.settings;
  const now = Date.now();

  const entries = useMemo(() => {
    let list = Object.values(st.vocab).filter((e) => matches(e, q.trim()));
    if (sort === 'recent') list.sort((a, b) => b.addedAt - a.addedAt);
    else if (sort === 'az') list.sort((a, b) => plainPinyin(a.py).localeCompare(plainPinyin(b.py)) || a.w.localeCompare(b.w));
    else if (sort === 'due') list.sort((a, b) => (dueAt(st.srs[a.w]) || 0) - (dueAt(st.srs[b.w]) || 0));
    return list;
  }, [st.vocab, st.srs, q, sort]);

  const groups = useMemo(() => {
    if (!grouped) return [['', entries]];
    const m = new Map();
    for (const e of entries) { const k = e.title || hostOf(e.url) || 'Other words'; if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    return [...m.entries()];
  }, [entries, grouped]);

  const exportAs = (format) => {
    setMenu(false);
    api.exportText(format, { words: entries.map((e) => e.w) }).then((r) => {
      const ext = format === 'csv' ? 'csv' : 'txt';
      downloadText(`zhongwen-vocab-${format}.${ext}`, r.text, format === 'csv' ? 'text/csv' : 'text/plain');
      toast(`${r.count} words exported for ${format === 'anki' ? 'Anki' : format === 'pleco' ? 'Pleco' : 'CSV'}`);
    });
  };

  if (!Object.keys(st.vocab).length) {
    return (
      <div>
        <div class="page-head"><h1>Vocabulary</h1></div>
        <div class="empty"><div class="big">还没有词</div>No words yet. Turn lookups on, hover a word on any page and press <kbd>s</kbd> — it's saved together with its sentence.</div>
      </div>
    );
  }
  return (
    <div>
      <div class="page-head">
        <h1>Vocabulary</h1>
        <span class="sub">{entries.length === Object.keys(st.vocab).length ? `${entries.length} ${entries.length === 1 ? 'word' : 'words'}` : `${entries.length} of ${Object.keys(st.vocab).length} words`}</span>
        <div class="grow" />
        <button class="btn btn-primary" onClick={() => go('/review')}>Review</button>
        <div class="menu">
          <button class="btn" onClick={() => setMenu(!menu)}>Export ▾</button>
          {menu && <div class="menu-list"><button onClick={() => exportAs('anki')}>Anki (tab-separated)</button><button onClick={() => exportAs('pleco')}>Pleco flashcards</button><button onClick={() => exportAs('csv')}>CSV</button></div>}
        </div>
      </div>
      <div class="toolbar">
        <input class="input" placeholder="Search hanzi, pinyin, meaning or sentence" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <Seg value={sort} onChange={setSort} options={[['recent', 'Recent'], ['az', 'A–Z'], ['due', 'Due']]} />
        <Seg value={grouped ? 'g' : 'f'} onChange={(v) => setGrouped(v === 'g')} options={[['g', 'By source'], ['f', 'Flat']]} />
      </div>
      {groups.map(([title, list]) => (
        <div class="group" key={title}>
          {title && (
            <div class="group-head">
              <h2>{title}</h2><span class="n">{list.length}</span>
              <div class="grow" />
              <button class="btn btn-sm" onClick={() => go('/review', { title })}>Review these</button>
            </div>
          )}
          <div class="list">
            {list.map((e) => <Row key={e.w} e={e} card={st.srs[e.w]} s={s} now={now} open={open === e.w} onOpen={() => setOpen(open === e.w ? null : e.w)} toast={toast} />)}
          </div>
        </div>
      ))}
      {toastEl}
    </div>
  );
}

function Row({ e, card, s, now, open, onOpen, toast }) {
  const label = dueLabel(card, now);
  const [note, setNote] = useState(e.note || '');
  const lead = s.script === 'trad' && e.trad ? e.trad : e.w;
  return (
    <>
      <div class={`vrow ${open ? 'open' : ''}`} onClick={onOpen}>
        <span class="w"><Hanzi text={lead} py={e.py} trad={lead !== e.w} /></span>
        <div class="d"><div class="py"><Pinyin py={e.py} style={s.pinyinStyle} /></div><div class="def">{e.def}</div></div>
        <span class={`due ${label === 'Due' || label === 'New' ? 'now' : ''}`} title={reviewed(card) ? `${familiarity(card)} · next review` : 'never reviewed'}>{label}</span>
      </div>
      {open && (
        <div class="vdetail">
          {e.sent ? <div class="sent"><Sentence text={e.sent} word={e.w} trad={e.trad} /></div> : <div class="faint small">No sentence was saved with this word.</div>}
          {e.url ? <div class="src">From <a href={e.url} target="_blank" rel="noopener">{e.title || hostOf(e.url)}</a> · {fmtDate(e.addedAt)}</div> : <div class="src">{e.title || ''}{e.title ? ' · ' : ''}{fmtDate(e.addedAt)}</div>}
          {e.trad && e.trad !== e.w && <div class="small soft">Traditional <span class="zw-han zw-han-trad">{e.trad}</span></div>}
          <textarea class="input" placeholder="Your note…" value={note} onInput={(ev) => setNote(ev.currentTarget.value)} onBlur={() => { if ((note || '') !== (e.note || '')) api.setNote(e.w, note).then(() => toast('Note saved')); }} />
          <div class="wrap">
            <button class="btn btn-sm" onClick={() => speak(lead, { rate: s.ttsRate })}>Listen</button>
            <button class="btn btn-sm" onClick={() => go('/dictionary', { q: e.w })}>Dictionary</button>
            {reviewed(card) && <button class="btn btn-sm" onClick={() => api.resetCard(e.w).then(() => toast('Progress reset'))}>Reset progress</button>}
            <button class="btn btn-sm btn-danger" onClick={() => { if (confirm(`Remove ${e.w} from your vocabulary?`)) api.removeWord(e.w).then(() => toast('Removed')); }}>Remove</button>
          </div>
        </div>
      )}
    </>
  );
}

// a saved sentence with the word marked (either script)
export function Sentence({ text, word, trad, blank = false }) {
  const forms = [word, trad].filter(Boolean);
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const f = forms.find((w) => text.startsWith(w, i));
    if (f) { parts.push(blank ? <span class="blank">{'＿'.repeat(Array.from(f).length)}</span> : <mark>{f}</mark>); i += f.length; }
    else { const j = Math.min(...forms.map((w) => { const k = text.indexOf(w, i); return k < 0 ? text.length : k; }), text.length); parts.push(text.slice(i, Math.max(i + 1, j))); i = Math.max(i + 1, j); }
  }
  return <>{parts}</>;
}
