import { describe, it, expect } from 'vitest';
import { reviewQueue, streak } from '../src/shared/review.js';
import { gradeCard } from '../src/shared/fsrs.js';
import { dayKey } from '../src/shared/schema.js';

const DAY = 86400000;
describe('reviewQueue', () => {
  it('splits due and new, honoring daily caps', () => {
    const now = Date.parse('2026-03-01T10:00:00Z');
    const old = gradeCard(undefined, 'good', now - 10 * DAY); // due by now
    const later = gradeCard(undefined, 'easy', now - 1000); // not due
    const state = {
      vocab: { a: { w: 'a', addedAt: 1 }, b: { w: 'b', addedAt: 2 }, c: { w: 'c', addedAt: 3 }, d: { w: 'd', addedAt: 0 } },
      srs: { a: old, b: later },
      settings: { reviewPerDay: 200, reviewNewPerDay: 1 },
      daily: { date: dayKey(now), newDone: 0, reviewDone: 0 },
    };
    const q = reviewQueue(state, now);
    expect(q.due.map((x) => x.w)).toEqual(['a']);
    expect(q.fresh.map((x) => x.w)).toEqual(['d']); // oldest first, capped at 1
    expect(q.freshTotal).toBe(2);
    const q2 = reviewQueue({ ...state, daily: { date: dayKey(now), newDone: 1, reviewDone: 0 } }, now);
    expect(q2.fresh).toEqual([]);
    const q3 = reviewQueue({ ...state, daily: { date: 'old', newDone: 9, reviewDone: 9 } }, now); // stale day resets
    expect(q3.fresh).toHaveLength(1);
    expect(reviewQueue(state, now, new Set(['c'])).fresh.map((x) => x.w)).toEqual(['c']);
  });
});
describe('streak', () => {
  it('counts consecutive active days, tolerating an unused today', () => {
    const now = Date.parse('2026-03-05T10:00:00');
    const k = (d) => dayKey(now - d * DAY);
    expect(streak({ [k(0)]: { saved: 1 }, [k(1)]: { reviewed: 2 }, [k(2)]: { lookups: 5 } }, now)).toBe(2);
    expect(streak({ [k(1)]: { saved: 1 }, [k(2)]: { saved: 1 } }, now)).toBe(2);
    expect(streak({ [k(2)]: { saved: 1 } }, now)).toBe(0);
    expect(streak({}, now)).toBe(0);
  });
});
