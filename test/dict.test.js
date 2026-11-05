import { describe, it, expect } from 'vitest';
import { loadTestDict } from './helpers.js';
import { decodeEntry, matchesAt, segmentRun, segmentText, shortGloss, hasWord } from '../src/shared/dict.js';

const dict = loadTestDict();

describe('decodeEntry', () => {
  it('decodes a simplified headword with readings and senses', () => {
    const e = decodeEntry(dict, '传统');
    expect(e.simp).toBe('传统');
    expect(e.trad).toBe('傳統');
    expect(e.readings[0].sylls.map((s) => s.marks)).toEqual(['chuán', 'tǒng']);
    expect(e.readings[0].defs[0]).toMatch(/tradition/);
    expect(e.hsk).toBeGreaterThan(0);
  });
  it('follows a traditional alias to the simplified record', () => {
    const e = decodeEntry(dict, '傳統');
    expect(e.simp).toBe('传统');
  });
  it('orders the everyday reading before the proper-noun one', () => {
    const e = decodeEntry(dict, '都');
    expect(e.readings[0].py).toBe('dou1');
  });
  it('returns null for an unknown word', () => {
    expect(decodeEntry(dict, '龘龘龘')).toBeNull();
    expect(hasWord(dict, 'abc')).toBe(false);
  });
});

describe('matchesAt', () => {
  it('lists every word starting at the cursor, longest first', () => {
    const m = matchesAt(dict, '中国人民银行很');
    expect(m[0].word).toBe('中国人民银行');
    expect(m.map((x) => x.word)).toContain('中国');
    expect(m[m.length - 1].word).toBe('中');
  });
  it('works for traditional text', () => {
    const m = matchesAt(dict, '學生們');
    expect(m[0].word).toBe('學生');
    expect(m[0].entry.simp).toBe('学生');
  });
});

describe('segmentation', () => {
  it('prefers the segmentation with fewer fragments', () => {
    expect(segmentRun(dict, '我是中国人')).toEqual(['我', '是', '中国人']);
    expect(segmentRun(dict, '經傳統中醫')).toEqual(['經', '傳統', '中醫']);
  });
  it('passes non-Han text through', () => {
    const t = segmentText(dict, '今天天气很好，Hello！');
    expect(t.map((x) => x.w || x.text)).toEqual(['今天', '天气', '很', '好', '，Hello！']);
    expect(shortGloss(t[0].entry)).toMatch(/today/);
  });
});
