import { describe, it, expect } from 'vitest';
import { gradeCard, dueAt, bucketOf, familiarity, fmtDue, summarize, previewDue, dueLabel } from '../src/shared/fsrs.js';

const DAY = 86400000;
describe('fsrs wrapper', () => {
  it('grades a new word and schedules it', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    const c = gradeCard(undefined, 'good', now);
    expect(c.reps).toBe(1);
    expect(dueAt(c)).toBeGreaterThan(now);
    expect(familiarity(c)).toBe('learning');
    expect(bucketOf(c, now)).toMatch(/soon|later/);
    expect(previewDue(c, 'easy', now)).toBeGreaterThan(previewDue(c, 'again', now));
  });
  it('matures with repeated good grades', () => {
    let now = Date.parse('2026-01-01T12:00:00Z');
    let c;
    for (let i = 0; i < 8; i++) { c = gradeCard(c, 'easy', now); now = dueAt(c) + 1000; }
    expect(familiarity(c)).toBe('mature');
    expect(bucketOf(c, now)).toBe('due');
    expect(dueLabel(c, now)).toBe('Due');
  });
  it('heals a damaged card instead of throwing', () => {
    const c = gradeCard({ state: 2, stability: NaN, difficulty: 5, due: 'garbage' }, 'again');
    expect(c.reps).toBe(1);
  });
  it('formats intervals', () => {
    const now = 0;
    expect(fmtDue(now + 5 * 60000, now)).toBe('5m');
    expect(fmtDue(now + 3 * 3600000, now)).toBe('3h');
    expect(fmtDue(now + 4 * DAY, now)).toBe('4d');
    expect(fmtDue(now + 90 * DAY, now)).toBe('3mo');
    expect(fmtDue(now + 800 * DAY, now)).toBe('2.2y');
  });
  it('summarizes buckets', () => {
    const s = summarize([undefined, gradeCard(undefined, 'good')]);
    expect(s.total).toBe(2);
    expect(s.new).toBe(1);
  });
});
