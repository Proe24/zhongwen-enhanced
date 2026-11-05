// popup.jsx — the toolbar popup: the on/off switch, this-site switch, a quick
// dictionary search, today's numbers, and doors into the Library.
import { render } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';
import { api } from '../shared/api.js';
import { useAppState, Switch, WordRow } from '../components/ui.jsx';
import { WordCard, charInfoFromMatch } from '../components/WordCard.jsx';
import { queueCount, streak } from '../shared/review.js';
import { shortGloss } from '../shared/dict.js';
import { speak } from '../shared/tts.js';

function useActiveHost() {
  const [host, setHost] = useState('');
  useEffect(() => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs && tabs[0] && tabs[0].url;
        try { const u = new URL(url); if (/^https?:$/.test(u.protocol)) setHost(u.hostname); } catch { /* no url */ }
      });
    } catch { /* no tabs api */ }
  }, []);
  return host;
}

function Popup() {
  const { st } = useAppState();
  const host = useActiveHost();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(null); // a match shown in full
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    if (!q.trim()) { setResults([]); setOpen(null); return; }
    const t = setTimeout(() => api.search(q, 12).then((r) => { if (id === seq.current) { setResults(r.results); setOpen(null); } }).catch(() => {}), 120);
    return () => clearTimeout(t);
  }, [q]);

  if (!st) return <div style="padding:16px" class="soft">Loading…</div>;
  const s = st.settings;
  const siteOff = host && s.disabledSites.includes(host);
  const words = Object.keys(st.vocab).length;
  const due = queueCount(st);
  const days = streak(st.stats);
  const go = (route) => api.openApp(route).then(() => window.close());
  const toggleSaved = (m) => (m.saved ? api.removeWord(m.entry.simp) : api.saveWord({ w: m.entry.simp, trad: m.entry.trad, py: m.entry.readings[0].py, def: m.entry.readings[0].defs.slice(0, 3).join('; '), sent: '', url: '', title: 'Looked up' }))
    .then(() => setOpen({ ...m, saved: !m.saved, fam: m.saved ? null : 'new' }));

  return (
    <div class="pop">
      <div class="pop-head">
        <img class="pop-logo" src="../icons/icon48.png" alt="" />
        <div class="grow">
          <div class="pop-title">{st.enabled ? 'Lookups are on' : 'Lookups are off'}</div>
          <div class="pop-sub">{st.enabled ? 'Hover Chinese text on any page' : 'Alt+Z also toggles'}</div>
        </div>
        <Switch on={st.enabled} label="Lookups" onChange={(v) => api.setEnabled(v)} />
      </div>
      {host && (
        <div class="pop-site">
          <span class="grow">{siteOff ? 'Off on' : 'On'} <b>{host}</b></span>
          <Switch on={!siteOff} label={`Lookups on ${host}`} onChange={() => api.siteToggle(host)} />
        </div>
      )}
      <div class="pop-search">
        <input class="input" placeholder="Search: 汉字, pinyin or English" value={q} onInput={(e) => setQ(e.currentTarget.value)} autofocus />
      </div>
      {open ? (
        <div class="pop-entry">
          <button class="btn btn-sm btn-quiet" onClick={() => setOpen(null)}>‹ results</button>
          <WordCard match={open} settings={s} charInfo={charInfoFromMatch(open)} onToggleSave={() => toggleSaved(open)} onSpeak={() => speak(open.word, { rate: s.ttsRate })} onDrill={(c) => api.entry(c).then((r) => r.match && setOpen(r.match))} />
        </div>
      ) : results.length > 0 ? (
        <div class="pop-results">
          {results.map((m) => <WordRow key={m.word} word={m.entry.simp} trad={m.entry.trad} py={m.entry.readings[0].py} gloss={shortGloss(m.entry, 2)} style={s.pinyinStyle} leadTrad={s.script === 'trad'} saved={m.saved} onClick={() => setOpen(m)} />)}
        </div>
      ) : q.trim() ? <div class="pop-results faint small" style="padding:6px 12px 12px">Nothing found.</div> : null}
      <div class="pop-stats">
        <button class={`stat ${due ? 'hot' : ''}`} onClick={() => go('/review')} title="Review now"><b>{due}</b><span>to review</span></button>
        <button class="stat" onClick={() => go('/vocab')}><b>{words}</b><span>words</span></button>
        <button class="stat" onClick={() => go('/stats')}><b>{days}</b><span>day streak</span></button>
      </div>
      <div class="pop-links">
        <button class="btn btn-sm" onClick={() => go('/vocab')}>Library</button>
        <button class="btn btn-sm" onClick={() => go('/settings')}>Settings</button>
        <button class="btn btn-sm" onClick={() => go('/help')}>Help</button>
      </div>
    </div>
  );
}
render(<Popup />, document.getElementById('root'));
