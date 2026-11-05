import { describe, it, expect } from 'vitest';
import { migrateV1, sentenceId } from '../src/shared/schema.js';
import { normalizeSettings, DEFAULTS } from '../src/shared/settings.js';

describe('migrateV1', () => {
  it('turns the v1 wordlist into vocab + sentences', () => {
    const v1 = JSON.stringify([
      { timestamp: 1000, simplified: '传统', traditional: '傳統', pinyin: 'chuan2 tong3', definition: 'tradition', list: 'HSK5', notes: 'hi' },
      { timestamp: 2000, simplified: '你好', traditional: '你好', pinyin: 'ni3 hao3', definition: 'hello' },
      { timestamp: 3000, simplified: '我爱你。', traditional: '我愛你。', pinyin: '', definition: 'I love you.', isSentence: true },
      { timestamp: 4000, simplified: '传统', traditional: '傳統', pinyin: 'chuan2 tong3', definition: 'dup' },
      null, { bogus: true },
    ]);
    const { vocab, sentences } = migrateV1(v1);
    expect(Object.keys(vocab)).toEqual(['传统', '你好']);
    expect(vocab['传统']).toMatchObject({ trad: '傳統', py: 'chuan2 tong3', def: 'tradition', title: 'HSK5', note: 'hi', addedAt: 1000 });
    expect(vocab['你好'].trad).toBe('');
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toMatchObject({ text: '我爱你。', addedAt: 3000 });
  });
  it('survives garbage', () => {
    expect(migrateV1('not json')).toEqual({ vocab: {}, sentences: [] });
    expect(migrateV1(undefined)).toEqual({ vocab: {}, sentences: [] });
    expect(migrateV1('{"a":1}')).toEqual({ vocab: {}, sentences: [] });
  });
  it('hashes sentences stably', () => {
    expect(sentenceId('abc', 'u')).toBe(sentenceId('abc', 'u'));
    expect(sentenceId('abc', 'u')).not.toBe(sentenceId('abd', 'u'));
  });
});

describe('normalizeSettings', () => {
  it('repairs bad values and clamps numbers', () => {
    const s = normalizeSettings({ theme: 'neon', popupScale: 9, hoverDelay: '120', toneColors: 0, disabledSites: ['a.com', 3], extra: 1 });
    expect(s.theme).toBe(DEFAULTS.theme);
    expect(s.popupScale).toBe(1.6);
    expect(s.hoverDelay).toBe(120);
    expect(s.toneColors).toBe(false);
    expect(s.disabledSites).toEqual(['a.com']);
    expect(s.extra).toBeUndefined();
  });
  it('returns defaults for nothing', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULTS);
  });
});
