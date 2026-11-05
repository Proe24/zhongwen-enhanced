// fsrs.js — spaced repetition via ts-fsrs (MIT). The app speaks in grade ids
// ('again' | 'hard' | 'good' | 'easy') and millisecond timestamps; a stored
// card is a plain ts-fsrs Card with ISO date strings.
import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs';

const scheduler = fsrs();
const RATING = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
export const GRADES = ['again', 'hard', 'good', 'easy'];
const DAY = 86400000;
export const MATURE_DAYS = 21;

export const newCard = (now = Date.now()) => createEmptyCard(new Date(now));

const isCard = (c) => !!c && typeof c.state === 'number' && Number.isFinite(c.stability) && Number.isFinite(c.difficulty);
const lastReviewAt = (c) => { const t = c && c.last_review != null ? new Date(c.last_review).getTime() : 0; return Number.isNaN(t) ? 0 : t; };

// Grade a card (or nothing: a word never reviewed) and return the next card.
// Never throws: a damaged card is replaced by a fresh one graded once.
export function gradeCard(card, gradeId, now = Date.now()) {
  const base = isCard(card) ? card : newCard(now);
  const at = new Date(Math.max(now, lastReviewAt(base)));
  const rating = RATING[gradeId] ?? Rating.Good;
  try { return scheduler.next(base, at, rating).card; }
  catch { try { return scheduler.next(newCard(now), new Date(now), rating).card; } catch { return newCard(now); } }
}

export function dueAt(card) {
  if (!card || card.due == null) return 0;
  const t = new Date(card.due).getTime();
  return Number.isNaN(t) ? 0 : t;
}
export const previewDue = (card, gradeId, now = Date.now()) => dueAt(gradeCard(card, gradeId, now));
export const reviewed = (card) => !!card && (card.reps ?? 0) > 0;
export const inLearning = (card) => !!card && (card.state === State.Learning || card.state === State.Relearning);
export const intervalDays = (card) => (card && typeof card.scheduled_days === 'number' ? card.scheduled_days : 0);

// new → learning → young → mature
export function familiarity(card) {
  if (!reviewed(card)) return 'new';
  if (inLearning(card)) return 'learning';
  return intervalDays(card) >= MATURE_DAYS ? 'mature' : 'young';
}

export function endOfDay(now = Date.now()) { const d = new Date(now); d.setHours(23, 59, 59, 999); return d.getTime(); }

// new | due | soon (later today) | later
export function bucketOf(card, now = Date.now()) {
  if (!reviewed(card)) return 'new';
  const due = dueAt(card);
  if (due <= now) return 'due';
  return due <= endOfDay(now) ? 'soon' : 'later';
}

export function fmtDue(ms, now = Date.now()) {
  const d = (ms - now) / DAY;
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 24 * 60))}m`;
  if (d < 1) return `${Math.round(d * 24)}h`;
  if (d < 30) return `${Math.max(1, Math.round(d))}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

export function dueLabel(card, now = Date.now()) {
  if (!reviewed(card)) return 'New';
  const due = dueAt(card);
  return due <= now ? 'Due' : fmtDue(due, now);
}

export function summarize(cards, now = Date.now()) {
  const c = { total: 0, new: 0, due: 0, soon: 0, later: 0, learning: 0, young: 0, mature: 0 };
  for (const card of cards) { c.total++; c[bucketOf(card, now)]++; const f = familiarity(card); if (f !== 'new') c[f]++; }
  return c;
}
