// Stats.jsx — how the vocabulary is doing: counts, familiarity, a year of
// activity, the last 30 days.
import { summarize } from '../shared/fsrs.js';
import { streak } from '../shared/review.js';
import { dayKey } from '../shared/schema.js';

const DAY = 86400000;
export function Stats({ st }) {
  const words = Object.keys(st.vocab);
  const sum = summarize(words.map((w) => st.srs[w]));
  const now = Date.now();
  const days = streak(st.stats, now);
  const totals = Object.values(st.stats).reduce((a, d) => ({ saved: a.saved + (d.saved || 0), reviewed: a.reviewed + (d.reviewed || 0), lookups: a.lookups + (d.lookups || 0) }), { saved: 0, reviewed: 0, lookups: 0 });
  // 26 weeks, aligned to weeks ending today
  const cells = [];
  const start = now - (26 * 7 - 1) * DAY - new Date(now).getDay() * DAY;
  for (let t = start; t <= now; t += DAY) { const d = st.stats[dayKey(t)] || {}; const n = (d.saved || 0) + (d.reviewed || 0); cells.push({ t, n, lvl: n === 0 ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 40 ? 3 : 4 }); }
  const last30 = []; for (let i = 29; i >= 0; i--) { const d = st.stats[dayKey(now - i * DAY)] || {}; last30.push({ s: d.saved || 0, r: d.reviewed || 0 }); }
  const max30 = Math.max(1, ...last30.map((d) => d.s + d.r));
  const pct = (n) => (sum.total ? (n / sum.total) * 100 : 0);
  return (
    <div>
      <div class="page-head"><h1>Stats</h1></div>
      <div class="stat-grid">
        <div class="stat-tile"><b>{words.length}</b><span>words</span></div>
        <div class="stat-tile"><b>{st.sentences.length}</b><span>sentences</span></div>
        <div class="stat-tile"><b>{days}</b><span>day streak</span></div>
        <div class="stat-tile"><b>{totals.reviewed}</b><span>reviews all time</span></div>
        <div class="stat-tile"><b>{totals.lookups}</b><span>lookups</span></div>
      </div>
      <div class="card">
        <div class="label">Familiarity</div>
        <div class="fam-bar">
          <i style={{ width: `${pct(sum.mature)}%`, background: 'var(--zw-good)' }} title="mature" />
          <i style={{ width: `${pct(sum.young)}%`, background: 'var(--zw-tone2)' }} title="young" />
          <i style={{ width: `${pct(sum.learning)}%`, background: 'var(--zw-tone1)' }} title="learning" />
        </div>
        <div class="legend">
          <span><i style="background:var(--zw-good)" />{sum.mature} mature</span><span><i style="background:var(--zw-tone2)" />{sum.young} young</span><span><i style="background:var(--zw-tone1)" />{sum.learning} learning</span><span><i style="background:var(--zw-track)" />{sum.new} new</span>
          <span class="faint">· {sum.due} due now · {sum.soon} later today</span>
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="label">Last 26 weeks · words saved + reviews</div>
        <div class="heat" style="margin-top:8px">{cells.map((c) => <i key={c.t} class={`l${c.lvl}`} title={`${dayKey(c.t)}: ${c.n}`} />)}</div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="label">Last 30 days</div>
        <div class="bars" style="margin-top:8px">{last30.map((d, i) => <i key={i} class={d.r >= d.s ? 'r' : ''} style={{ height: `${((d.s + d.r) / max30) * 100}%` }} title={`${d.s} saved, ${d.r} reviewed`} />)}</div>
        <div class="legend" style="margin-top:6px"><span><i style="background:var(--zw-accent)" />mostly reviews</span><span><i style="background:var(--zw-accent-tint)" />mostly new words</span></div>
      </div>
    </div>
  );
}
