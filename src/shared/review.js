// review.js — what to study now, and the streak. Pure functions over state.
import { dueAt, reviewed } from './fsrs.js';
import { dayKey } from './schema.js';

// Today's queue, Anki-style: due reviews first (capped by reviewPerDay minus
// what's done today), then never-reviewed words (capped by reviewNewPerDay).
// Each item is a vocab entry plus its card. `scope` (optional) is a Set of words.
export function reviewQueue(state, now = Date.now(), scope = null) {
  const { vocab, srs, settings } = state;
  const daily = state.daily && state.daily.date === dayKey(now) ? state.daily : { newDone: 0, reviewDone: 0 };
  const due = [];
  const fresh = [];
  for (const w of Object.keys(vocab)) {
    if (scope && !scope.has(w)) continue;
    const card = srs[w];
    if (reviewed(card)) { if (dueAt(card) <= now) due.push({ ...vocab[w], card }); }
    else fresh.push({ ...vocab[w], card: card || null });
  }
  due.sort((a, b) => dueAt(a.card) - dueAt(b.card));
  fresh.sort((a, b) => a.addedAt - b.addedAt); // oldest saved first
  const dueCap = Math.max(0, (settings.reviewPerDay ?? 200) - daily.reviewDone);
  const newCap = Math.max(0, (settings.reviewNewPerDay ?? 20) - daily.newDone);
  return { due: due.slice(0, dueCap), fresh: fresh.slice(0, newCap), dueTotal: due.length, freshTotal: fresh.length };
}

export const queueCount = (state, now) => { const q = reviewQueue(state, now); return q.due.length + q.fresh.length; };

// consecutive days with activity (saved or reviewed), counting back from today
// — or from yesterday, so a streak isn't "broken" before the day has been used
export function streak(stats, now = Date.now()) {
  const active = (k) => { const d = stats && stats[k]; return !!d && ((d.saved || 0) + (d.reviewed || 0) > 0); };
  const DAY = 86400000;
  let n = 0;
  let t = now;
  if (!active(dayKey(t))) { t -= DAY; if (!active(dayKey(t))) return 0; }
  while (active(dayKey(t))) { n++; t -= DAY; }
  return n;
}
