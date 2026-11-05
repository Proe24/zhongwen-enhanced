import { describe, it, expect } from 'vitest';
import { loadTestDict } from './helpers.js';
import { searchDict } from '../src/shared/search.js';

const dict = loadTestDict();
describe('searchDict', () => {
  it('finds by hanzi', () => {
    const r = searchDict(dict, '中国');
    expect(r[0].word).toBe('中国');
    expect(r.some((x) => x.word === '中国人')).toBe(true);
  });
  it('finds by pinyin, everyday words first', () => {
    const r = searchDict(dict, 'nihao', 5).map((x) => x.word);
    expect(r[0]).toBe('你好');
    expect(searchDict(dict, 'zhōng guó', 5).map((x) => x.word)).toContain('中国');
  });
  it('finds by English', () => {
    const r = searchDict(dict, 'tradition', 10).map((x) => x.word);
    expect(r).toContain('传统');
  });
  it('is empty for nothing', () => {
    expect(searchDict(dict, '')).toEqual([]);
  });
});
