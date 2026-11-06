// Settings.jsx — every preference, with a live preview card; data tools.
import { useState } from 'preact/hooks';
import { api } from '../shared/api.js';
import { Seg, Switch, useToast, downloadText } from '../components/ui.jsx';
import { WordCard } from '../components/WordCard.jsx';
import { TONE_PALETTES, THEMES, resolveScheme } from '../shared/theme.js';
import { DEFAULTS } from '../shared/settings.js';

const SAMPLE = {
  word: '传统', saved: true, fam: 'young', note: '', chars: [{ c: '传', py: 'chuan2', gloss: 'to pass on; to spread' }, { c: '统', py: 'tong3', gloss: 'to gather; to unite' }],
  entry: { simp: '传统', trad: '傳統', hsk: 4, readings: [{ py: 'chuan2 tong3', sylls: [{ tone: 2 }, { tone: 3 }], tones: [2, 3], trad: '傳統', defs: ['tradition', 'traditional', 'convention'] }] },
};

export function Settings({ st }) {
  const s = st.settings;
  const set = (patch) => api.setSettings(patch);
  const [toastEl, toast] = useToast();
  const [site, setSite] = useState('');
  const scheme = resolveScheme(s.theme, matchMedia('(prefers-color-scheme: dark)').matches);
  const Row = ({ title, sub, children }) => <div class="set-row"><div class="t"><b>{title}</b>{sub && <span>{sub}</span>}</div>{children}</div>;
  const Range = ({ k, min, max, step, fmt }) => <label class="row"><input type="range" min={min} max={max} step={step} value={s[k]} onInput={(e) => set({ [k]: Number(e.currentTarget.value) })} /><span class="small soft" style="width:48px;text-align:right">{fmt ? fmt(s[k]) : s[k]}</span></label>;

  const backup = () => api.backup().then((r) => { downloadText(`zhongwen-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(r.backup, null, 1), 'application/json'); toast('Backup downloaded'); });
  const restore = (mode) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      f.text().then((text) => api.restore(text, mode)).then((r) => toast(`Restored: ${r.words} words, ${r.sentences} sentences`)).catch((e) => alert(e.message));
    };
    inp.click();
  };
  const exportAll = (format) => api.exportText(format).then((r) => { downloadText(`zhongwen-vocab-${format}.${format === 'csv' ? 'csv' : 'txt'}`, r.text, format === 'csv' ? 'text/csv' : 'text/plain'); toast(`${r.count} words exported`); });

  return (
    <div>
      <div class="page-head"><h1>Settings</h1><span class="sub">changes apply immediately, on every page</span></div>

      <div class="set-section">
        <h2>Appearance</h2>
        <Row title="Theme"><Seg value={s.theme} onChange={(v) => set({ theme: v })} options={[['auto', 'System'], ['light', 'Light'], ['dark', 'Dark']]} /></Row>
        <Row title="Tone colors" sub="Color hanzi and pinyin by tone: 1 high · 2 rising · 3 dipping · 4 falling"><Switch on={s.toneColors} onChange={(v) => set({ toneColors: v })} /></Row>
        <Row title="Palette">
          <Seg value={s.tonePalette} onChange={(v) => set({ tonePalette: v })} options={Object.entries(TONE_PALETTES).map(([k, p]) => [k, <span>{p.label}<span class="swatches">{[1, 2, 3, 4].map((t) => <i key={t} style={{ background: p[scheme][t] }} />)}</span></span>])} />
        </Row>
        <Row title="Pinyin" sub="Tone marks, tone numbers, or zhuyin (bopomofo)"><Seg value={s.pinyinStyle} onChange={(v) => set({ pinyinStyle: v })} options={[['marks', 'nǐ hǎo'], ['numbers', 'ni3 hao3'], ['zhuyin', 'ㄋㄧˇㄏㄠˇ']]} /></Row>
        <Row title="Characters" sub="Which form leads in the popup; the other is shown beside it"><Seg value={s.script} onChange={(v) => set({ script: v })} options={[['page', 'As on the page'], ['simp', 'Simplified'], ['trad', 'Traditional']]} /></Row>
        <Row title="Popup size"><Range k="popupScale" min={0.75} max={1.6} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} /></Row>
        <div class="preview"><WordCard match={SAMPLE} settings={s} charInfo={(c) => SAMPLE.chars.find((x) => x.c === c)} onDrill={() => {}} onToggleSave={() => {}} onSpeak={() => {}} /></div>
      </div>

      <div class="set-section">
        <h2>Looking up</h2>
        <Row title="Trigger" sub="Look up on hover, or only while holding a key"><Seg value={s.trigger} onChange={(v) => set({ trigger: v })} options={[['hover', 'Hover'], ['alt', 'Hold Alt'], ['ctrl', 'Hold Ctrl'], ['shift', 'Hold Shift']]} /></Row>
        <Row title="Hover delay" sub="How long the pointer rests on a word before it is looked up"><Range k="hoverDelay" min={0} max={600} step={10} fmt={(v) => `${v} ms`} /></Row>
        <Row title="On hover" sub="A peek (word, pinyin, two senses) or the whole card"><Seg value={s.hoverCard} onChange={(v) => set({ hoverCard: v })} options={[['peek', 'Peek'], ['full', 'Full card']]} /></Row>
        <Row title="Expand key" sub={`Hold it to grow a peek into the full card; release to shrink back. Can't be the lookup trigger key${s.trigger !== 'hover' ? ` (${s.trigger === 'alt' ? 'Alt' : s.trigger === 'ctrl' ? 'Ctrl' : 'Shift'})` : ''}.`}><Seg value={s.expandKey} onChange={(v) => set({ expandKey: v })} options={[['shift', 'Shift'], ['alt', 'Alt'], ['ctrl', 'Ctrl']].filter(([k]) => k !== s.trigger)} /></Row>
        <Row title="HSK level" sub="Show the HSK 3.0 level badge when a word is on the lists"><Switch on={s.showHsk} onChange={(v) => set({ showHsk: v })} /></Row>
        <Row title="Keyboard hints" sub="The strip of shortcuts at the bottom of the popup (? toggles it too)"><Switch on={s.showHints} onChange={(v) => set({ showHints: v })} /></Row>
        <Row title="Speech rate"><Range k="ttsRate" min={0.5} max={1.5} step={0.05} fmt={(v) => `${v.toFixed(2)}×`} /></Row>
      </div>

      <div class="set-section">
        <h2>Sites</h2>
        <p class="small soft">Lookups stay off on these sites even while the extension is on. The toolbar popup has a switch for the current site.</p>
        <div class="wrap" style="margin-bottom:10px">
          {s.disabledSites.map((h) => <button key={h} class="chip" onClick={() => api.siteToggle(h)} title="Remove">{h} ×</button>)}
          {!s.disabledSites.length && <span class="small faint">None yet.</span>}
        </div>
        <form class="row" onSubmit={(e) => { e.preventDefault(); const h = site.trim().replace(/^https?:\/\//, '').split('/')[0]; if (h && !s.disabledSites.includes(h)) api.siteToggle(h); setSite(''); }}>
          <input class="input" style="max-width:280px" placeholder="example.com" value={site} onInput={(e) => setSite(e.currentTarget.value)} /><button class="btn" type="submit">Add</button>
        </form>
      </div>

      <div class="set-section">
        <h2>Review</h2>
        <Row title="New words per day" sub="Never-reviewed words introduced per day"><Range k="reviewNewPerDay" min={0} max={100} step={5} /></Row>
        <Row title="Reviews per day"><Range k="reviewPerDay" min={10} max={1000} step={10} /></Row>
        <Row title="Show the sentence" sub="The sentence a word was saved from, on the back of its card"><Switch on={s.reviewContext} onChange={(v) => set({ reviewContext: v })} /></Row>
        <Row title="Cloze front" sub="Show the sentence with the word blanked out instead of the word alone"><Switch on={s.reviewCloze} onChange={(v) => set({ reviewCloze: v })} /></Row>
      </div>

      <div class="set-section">
        <h2>Your data</h2>
        <p class="small soft">Everything lives in this browser. Export flashcards, or keep a backup file you can restore anywhere.</p>
        <div class="wrap">
          <button class="btn" onClick={() => exportAll('anki')}>Export for Anki</button>
          <button class="btn" onClick={() => exportAll('pleco')}>Export for Pleco</button>
          <button class="btn" onClick={() => exportAll('csv')}>Export CSV</button>
        </div>
        <div class="wrap" style="margin-top:10px">
          <button class="btn btn-primary" onClick={backup}>Download backup</button>
          <button class="btn" onClick={() => restore('merge')}>Restore (merge)</button>
          <button class="btn" onClick={() => { if (confirm('Replace everything in this browser with the backup file?')) restore('replace'); }}>Restore (replace)</button>
        </div>
        <div class="card danger-zone" style="margin-top:16px">
          <div class="row"><div class="grow"><b>Clear vocabulary, sentences and progress</b><div class="small faint">Settings stay. This cannot be undone — download a backup first.</div></div>
            <button class="btn btn-danger" onClick={() => { if (confirm('Delete all saved words, sentences and review progress?')) api.clearAll().then(() => toast('Cleared')); }}>Clear</button></div>
        </div>
        <div class="wrap" style="margin-top:12px"><button class="btn btn-sm btn-quiet" onClick={() => { if (confirm('Reset every setting to its default?')) set({ ...DEFAULTS }).then(() => toast('Settings reset')); }}>Reset settings to defaults</button></div>
      </div>
      {toastEl}
    </div>
  );
}
