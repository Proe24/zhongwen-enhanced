import { describe, it, expect } from 'vitest';
import { markSyllable, syllables, renderPinyin, toZhuyin, plainPinyin, tonesOf } from '../src/shared/pinyin.js';

describe('pinyin marks', () => {
  it('places the mark on a/e first, then ou, then the last vowel', () => {
    expect(markSyllable('hao3')).toBe('hǎo');
    expect(markSyllable('xie4')).toBe('xiè');
    expect(markSyllable('gou3')).toBe('gǒu');
    expect(markSyllable('liu2')).toBe('liú');
    expect(markSyllable('hui4')).toBe('huì');
    expect(markSyllable('lu:4')).toBe('lǜ');
    expect(markSyllable('nv3')).toBe('nǚ');
    expect(markSyllable('de5')).toBe('de');
    expect(markSyllable('Bei3')).toBe('Běi');
  });
  it('splits multi-syllable readings', () => {
    expect(syllables('chuan2 tong3').map((s) => s.marks)).toEqual(['chuán', 'tǒng']);
    expect(tonesOf('ni3 hao3 ma5')).toEqual([3, 3, 0]);
    expect(renderPinyin('zhong1 guo2', 'numbers')).toEqual(['zhong1', 'guo2']);
  });
});

describe('zhuyin', () => {
  it('converts initials and finals', () => {
    expect(toZhuyin('zhong', 1)).toBe('ㄓㄨㄥ');
    expect(toZhuyin('guo', 2)).toBe('ㄍㄨㄛˊ');
    expect(toZhuyin('shi', 4)).toBe('ㄕˋ');
    expect(toZhuyin('zi', 3)).toBe('ㄗˇ');
    expect(toZhuyin('xue', 2)).toBe('ㄒㄩㄝˊ');
    expect(toZhuyin('jun', 1)).toBe('ㄐㄩㄣ');
    expect(toZhuyin('lü', 4)).toBe('ㄌㄩˋ');
    expect(toZhuyin('you', 3)).toBe('ㄧㄡˇ');
    expect(toZhuyin('wen', 2)).toBe('ㄨㄣˊ');
    expect(toZhuyin('yuan', 2)).toBe('ㄩㄢˊ');
    expect(toZhuyin('er', 4)).toBe('ㄦˋ');
    expect(toZhuyin('de', 0)).toBe('˙ㄉㄜ');
    expect(toZhuyin('ma', 0)).toBe('˙ㄇㄚ');
    expect(toZhuyin('qiong', 2)).toBe('ㄑㄩㄥˊ');
    expect(toZhuyin('hm', 0)).toBe('hm');
  });
  it('renders a reading in zhuyin', () => {
    expect(renderPinyin('ni3 hao3', 'zhuyin')).toEqual(['ㄋㄧˇ', 'ㄏㄠˇ']);
  });
});

describe('plainPinyin', () => {
  it('normalizes marks, digits, ü', () => {
    expect(plainPinyin('nǐ hǎo')).toBe('nihao');
    expect(plainPinyin('ni3 hao3')).toBe('nihao');
    expect(plainPinyin('lǜ')).toBe('lv');
    expect(plainPinyin('nu:3')).toBe('nv');
  });
});
