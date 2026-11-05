import { describe, it, expect } from 'vitest';
import { toAnki, toPleco, toCsv, makeBackup, applyBackup } from '../src/shared/exports.js';

const entries = [
  { w: '传统', trad: '傳統', py: 'chuan2 tong3', def: 'tradition; convention', sent: '这是传统。', url: 'https://x.y/a', title: 'Page A', addedAt: 0, note: 'n1' },
  { w: '你好', trad: '', py: 'ni3 hao3', def: 'hello, "hi"', sent: 'a\tb\nc', url: '', title: '', addedAt: 86400000 },
];
describe('exports', () => {
  it('anki tsv', () => {
    const t = toAnki(entries).split('\n');
    expect(t[0]).toBe('#separator:tab');
    expect(t[3]).toBe('传统\t傳統\tchuán tǒng\ttradition; convention\t这是传统。\tPage A\tn1');
    expect(t[4]).toBe('你好\t你好\tnǐ hǎo\thello, "hi"\ta b c\t\t');
  });
  it('pleco', () => {
    expect(toPleco(entries)).toBe('传统[傳統]\tchuan2 tong3\ttradition; convention\n你好\tni3 hao3\thello, "hi"\n');
  });
  it('csv quoting', () => {
    const csv = toCsv(entries);
    expect(csv).toContain('"hello, ""hi"""');
    expect(csv).toContain('"a\tb\nc"');
    expect(csv.split('\n')[0]).toBe('simplified,traditional,pinyin,pinyin_marks,meaning,sentence,source_title,source_url,note,added');
  });
  it('backup round trip + merge', () => {
    const local = { vocab: { a: { w: 'a', addedAt: 1 } }, srs: {}, sentences: [{ id: 's1', addedAt: 5 }], settings: { theme: 'dark' }, stats: { '2026-01-01': { saved: 1 } }, daily: null, recent: ['a'] };
    const b = makeBackup({ ...local, vocab: { b: { w: 'b', addedAt: 2 } }, sentences: [{ id: 's2', addedAt: 9 }, { id: 's1', addedAt: 5 }], stats: { '2026-01-01': { reviewed: 3 }, '2026-01-02': { saved: 2 } } });
    const merged = applyBackup(local, b, 'merge');
    expect(Object.keys(merged.vocab).sort()).toEqual(['a', 'b']);
    expect(merged.sentences.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(merged.stats['2026-01-01']).toEqual({ reviewed: 3, saved: 1 });
    expect(merged.settings.theme).toBe('dark');
    const replaced = applyBackup(local, b, 'replace');
    expect(Object.keys(replaced.vocab)).toEqual(['b']);
    expect(() => applyBackup(local, { app: 'other' })).toThrow();
  });
});
