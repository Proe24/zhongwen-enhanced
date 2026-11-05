// Dictionary.jsx — search the whole dictionary (hanzi, pinyin, English) and
// read entries; recent lookups from the page popup are one click away.
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../shared/api.js';
import { WordRow, useToast } from '../components/ui.jsx';
import { WordCard, charInfoFromMatch } from '../components/WordCard.jsx';
import { shortGloss } from '../shared/dict.js';
import { speak } from '../shared/tts.js';
import { go } from './route.js';

export function Dictionary({ st, route }) {
  const s = st.settings;
  const [q, setQ] = useState(route.query.q || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(null);
  const [toastEl, toast] = useToast();
  const seq = useRef(0);
  useEffect(() => { if (route.query.q && route.query.q !== q) setQ(route.query.q); }, [route.query.q]); // eslint-disable-line
  useEffect(() => {
    const id = ++seq.current;
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => api.search(q, 30).then((r) => { if (id !== seq.current) return; setResults(r.results); if (r.results.length && (!open || route.query.q === q)) setOpen(r.results[0]); }).catch(() => {}), 120);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line
  // keep the open card's saved flag in sync with live state
  const shown = open ? { ...open, saved: !!st.vocab[open.entry.simp] } : null;
  const toggleSaved = (m) => (m.saved ? api.removeWord(m.entry.simp).then(() => toast('Removed')) : api.saveWord({ w: m.entry.simp, trad: m.entry.trad, py: m.entry.readings[0].py, def: m.entry.readings[0].defs.slice(0, 3).join('; '), sent: '', url: '', title: 'Looked up' }).then(() => toast('Saved')));
  return (
    <div>
      <div class="page-head"><h1>Dictionary</h1><span class="sub">{st.dictSource}</span></div>
      <div class="toolbar"><input class="input" placeholder="汉字, pinyin (ni3hao / nǐhǎo) or English" value={q} onInput={(e) => { setQ(e.currentTarget.value); go('/dictionary', { q: e.currentTarget.value }); }} autofocus /></div>
      <div class="dict-layout">
        <div>
          {results.length > 0 ? (
            <div class="list">{results.map((m) => <WordRow key={m.word} word={m.entry.simp} trad={m.entry.trad} py={m.entry.readings[0].py} gloss={shortGloss(m.entry, 2)} style={s.pinyinStyle} leadTrad={s.script === 'trad'} saved={!!st.vocab[m.entry.simp]} onClick={() => setOpen(m)} />)}</div>
          ) : q.trim() ? <div class="empty">Nothing found for “{q}”.</div> : st.recent.length ? (
            <div>
              <div class="label" style="padding:0 10px 6px">Recent lookups</div>
              <div class="list">{st.recent.slice(0, 30).map((w) => <RecentRow key={w} w={w} s={s} saved={!!st.vocab[w]} onOpen={(m) => { setOpen(m); }} />)}</div>
            </div>
          ) : <div class="empty">Type to search. Words you hover on pages show up here as recent lookups.</div>}
        </div>
        <div class="dict-card">
          {shown && <WordCard match={shown} settings={s} charInfo={charInfoFromMatch(shown)} onToggleSave={() => toggleSaved(shown)} onSpeak={() => speak(shown.entry.simp, { rate: s.ttsRate })} onDrill={(c) => api.entry(c).then((r) => r.match && setOpen(r.match))} onCopy={() => navigator.clipboard.writeText(`${shown.entry.simp}\t${shown.entry.readings[0].py}\t${shown.entry.readings[0].defs.join('; ')}`).then(() => toast('Copied'))} />}
        </div>
      </div>
      {toastEl}
    </div>
  );
}

function RecentRow({ w, s, saved, onOpen }) {
  const [m, setM] = useState(null);
  useEffect(() => { api.entry(w).then((r) => setM(r.match)).catch(() => {}); }, [w]);
  if (!m) return <div class="wrow"><span class="w zw-han">{w}</span></div>;
  return <WordRow word={m.entry.simp} trad={m.entry.trad} py={m.entry.readings[0].py} gloss={shortGloss(m.entry, 2)} style={s.pinyinStyle} leadTrad={s.script === 'trad'} saved={saved} onClick={() => onOpen(m)} />;
}
