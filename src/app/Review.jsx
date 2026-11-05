// Review.jsx — FSRS flashcards, one at a time. Front: the word (or its
// sentence with the word blanked out, in cloze mode). Back: pinyin, meaning,
// the sentence. Space reveals, 1–4 grade. A missed word comes back a few
// cards later in the same session.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../shared/api.js';
import { Hanzi, Pinyin } from '../components/Hanzi.jsx';
import { reviewQueue } from '../shared/review.js';
import { previewDue, fmtDue, GRADES } from '../shared/fsrs.js';
import { speak } from '../shared/tts.js';
import { Sentence } from './Vocab.jsx';
import { go } from './route.js';

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const LABEL = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };

export function Review({ st, route }) {
  const s = st.settings;
  const scope = route.query.title ? new Set(Object.values(st.vocab).filter((e) => e.title === route.query.title).map((e) => e.w)) : null;
  // the queue is seeded once per session (the live state keeps changing as we grade)
  const [queue, setQueue] = useState(null);
  const [done, setDone] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [againCount, setAgainCount] = useState(0);
  const start = () => { const q = reviewQueue(st, Date.now(), scope); setQueue(shuffle([...q.due, ...q.fresh]).map((c) => ({ ...c, step: 0 }))); setDone(0); setRevealed(false); setAgainCount(0); };
  useEffect(start, [route.query.title]); // eslint-disable-line

  const card = queue && queue[0];
  const total = (queue ? queue.length : 0) + done;
  const cur = card ? st.srs[card.w] : null; // live card (after in-session grades)
  const previews = useMemo(() => (card ? Object.fromEntries(GRADES.map((g) => [g, fmtDue(previewDue(cur, g))])) : null), [card && card.w, cur]); // eslint-disable-line

  const grade = (g) => {
    if (!card || grading) return;
    setGrading(true);
    api.grade(card.w, g).then((res) => {
      setGrading(false);
      setRevealed(false);
      setDone((d) => d + 1);
      if (g === 'again') setAgainCount((n) => n + 1);
      setQueue(([head, ...rest]) => {
        if (res && res.learning) { const back = { ...head, step: head.step + 1 }; const gap = Math.min(rest.length, 2 + Math.floor(Math.random() * 3)); return [...rest.slice(0, gap), back, ...rest.slice(gap)]; }
        return rest;
      });
    }).catch(() => setGrading(false));
  };

  // one listener for the whole session; it reads the latest state through a ref
  // so a key pressed right after a render can never hit a stale closure
  const live = useRef(null);
  live.current = { card, revealed, grade, rate: s.ttsRate };
  useEffect(() => {
    const h = (e) => {
      const { card, revealed, grade, rate } = live.current;
      if (!card || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!revealed) setRevealed(true); }
      else if (revealed && e.key >= '1' && e.key <= '4') { e.preventDefault(); grade(GRADES[Number(e.key) - 1]); }
      else if (e.key.toLowerCase() === 'a') speak(card.w, { rate });
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);

  if (!queue) return null;
  const head = <div class="page-head"><h1>Review</h1>{route.query.title && <span class="sub">{route.query.title} · <a href="#/review">all words</a></span>}</div>;
  if (!card) {
    const q = reviewQueue(st, Date.now(), scope);
    const later = q.dueTotal + q.freshTotal;
    return (
      <div>{head}
        <div class="rev-done">
          <div class="big">{done ? '复习完了' : '没有要复习的'}</div>
          <p class="soft">{done ? `${done} cards reviewed${againCount ? `, ${againCount} marked again` : ''}.` : 'Nothing is due right now.'}{later ? ` ${later} more ${later === 1 ? 'word is' : 'words are'} waiting beyond today's limits.` : ''}</p>
          <div class="wrap" style="justify-content:center">
            {later > 0 && <button class="btn btn-primary" onClick={start}>Keep going</button>}
            <button class="btn" onClick={() => go('/vocab')}>Vocabulary</button>
            <button class="btn" onClick={() => go('/settings')}>Daily limits</button>
          </div>
        </div>
      </div>
    );
  }
  const lead = s.script === 'trad' && card.trad ? card.trad : card.w;
  const other = card.trad && card.trad !== card.w ? (lead === card.w ? card.trad : card.w) : '';
  const hasSent = s.reviewContext && !!card.sent;
  const cloze = hasSent && s.reviewCloze;
  return (
    <div class="rev">
      {head}
      <div class="rev-top"><span>{done + 1} / {total}</span><span>{card.card && card.card.reps ? 'review' : 'new'}{card.step ? ' · again' : ''}</span></div>
      <div class="rev-bar"><i style={{ width: `${(done / Math.max(1, total)) * 100}%` }} /></div>
      <div class="rev-card" onClick={() => !revealed && setRevealed(true)}>
        {cloze && !revealed ? (
          <div class="rev-sent"><Sentence text={card.sent} word={card.w} trad={card.trad} blank /></div>
        ) : (
          <div class={`rev-word ${Array.from(lead).length > 4 ? 'long' : ''}`}><Hanzi text={lead} py={revealed ? card.py : ''} trad={lead !== card.w} /></div>
        )}
        {revealed ? (
          <>
            <div class="rev-py"><Pinyin py={card.py} style={s.pinyinStyle} /></div>
            {other && <div class="rev-other"><span class="zw-han">{other}</span></div>}
            <div class="rev-def">{card.def}</div>
            {hasSent && <div class="rev-sent"><Sentence text={card.sent} word={card.w} trad={card.trad} /></div>}
            {card.note && <div class="small soft">{card.note}</div>}
            <button class="btn btn-sm" onClick={(e) => { e.stopPropagation(); speak(lead, { rate: s.ttsRate }); }}>Listen (a)</button>
          </>
        ) : <div class="rev-hint">tap or press space to reveal</div>}
      </div>
      {revealed && (
        <div class="grades">
          {GRADES.map((g, i) => <button key={g} class={`grade ${g}`} disabled={grading} onClick={() => grade(g)}><b>{LABEL[g]}</b><span>{previews[g]} · {i + 1}</span></button>)}
        </div>
      )}
    </div>
  );
}
