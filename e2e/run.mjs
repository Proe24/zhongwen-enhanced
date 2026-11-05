// e2e/run.mjs — load dist/ into a real Chromium (headless) and exercise the
// extension end to end: turn lookups on, hover a word, read the popup, save
// the word, navigate with the keyboard, and check the Library sees it.
//
//   npm run build && npm run e2e          (set E2E_HEADED=1 to watch)
import http from 'node:http';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pw = (() => { for (const p of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean)) { try { return require(p); } catch {} } throw new Error('playwright not found — npm i -D playwright or set PLAYWRIGHT_MODULE'); })();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = resolve(ROOT, 'dist');
const OUT = resolve(ROOT, 'e2e/out');
mkdirSync(OUT, { recursive: true });
if (!existsSync(resolve(EXT, 'manifest.json'))) throw new Error('dist/ missing — run npm run build first');

const PAGE = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>测试页面</title>
<style>body{font-family:sans-serif;font-size:22px;padding:40px;max-width:700px} p{line-height:1.8}</style></head><body>
<h1 id="h">中文测试</h1>
<p id="p1">我是中国人民银行的职员。今天天气很好，我们去公园散步吧！</p>
<p id="p2">經過<b>傳統</b>中醫的治療，他的身體<i>慢慢</i>好了起來。</p>
<p id="p3">Mixed text with 学习 inside an English sentence, then 更多的中文。</p>
<div id="far" style="height:1500px"></div>
<p id="p4">最后一段。</p>
</body></html>`;

let failures = 0;
const check = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures++; console.log('  ✗ ' + msg); } };

const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(PAGE); });
await new Promise((res) => srv.listen(0, res));
const port = srv.address().port;
const ctx = await pw.chromium.launchPersistentContext('', {
  channel: 'chromium', headless: !process.env.E2E_HEADED, viewport: { width: 1100, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  console.log('extension', extId);

  // the install handler opens the help page; close it so it doesn't confuse the tab count
  await new Promise((r) => setTimeout(r, 800));
  for (const p of ctx.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();

  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${port}` });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  const popup = () => page.evaluate(() => {
    const host = document.querySelector('zhongwen-enhanced');
    const el = host && host.shadowRoot.querySelector('.zw-popup');
    if (!el) return null;
    const txt = (s) => { const n = el.querySelector(s); return n ? n.textContent.trim() : null; };
    return { word: txt('.zw-hero-word'), py: txt('.zw-hero-py'), sense: txt('.zw-senses li'), chips: [...el.querySelectorAll('.zw-chip')].map((c) => c.textContent.trim()), saved: txt('.zw-btn-primary, .zw-btn-on'), pinned: !!el.querySelector('.zw-pin'), rect: el.getBoundingClientRect().toJSON(), chars: el.querySelectorAll('.zw-char-row').length, toast: txt('.zw-toast') };
  });
  const hoverChar = async (id, charIndex) => {
    const box = await page.evaluate(({ id, i }) => {
      const el = document.getElementById(id);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n, seen = 0;
      while ((n = walker.nextNode())) {
        if (seen + n.data.length > i) { const r = document.createRange(); r.setStart(n, i - seen); r.setEnd(n, i - seen + 1); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }
        seen += n.data.length;
      }
      return null;
    }, { id, i: charIndex });
    await page.mouse.move(box.x, box.y);
    return box;
  };
  const waitPopup = async (pred = (p) => !!p, ms = 4000) => { const t0 = Date.now(); let p = null; while (Date.now() - t0 < ms) { p = await popup(); if (pred(p)) return p; await page.waitForTimeout(60); } return p; };

  console.log('\n1. off by default: hovering does nothing');
  await hoverChar('p1', 2);
  await page.waitForTimeout(500);
  check((await popup()) === null, 'no popup while off');

  console.log('2. turn on from the worker (what the toolbar switch / Alt+Z do)');
  await sw.evaluate(() => chrome.storage.local.set({ enabled: true }));
  await page.waitForTimeout(300);
  const badge = await sw.evaluate(() => chrome.action.getBadgeText({}));
  check(badge === 'ON' || badge === '', `badge text is "${badge}"`);

  console.log('3. hover 中 in 中国人民银行 → longest match first, pinyin, senses, chips, anchored below the word');
  const box = await hoverChar('p1', 2);
  let p = await waitPopup();
  check(p && p.word === '中国人民银行', `word is ${p && p.word}`);
  check(p && /zhōng/i.test(p.py), `pinyin ${p && p.py}`);
  check(p && p.sense === "People's Bank of China", `sense "${p && p.sense}" (single sense, unnumbered)`);
  check(p && p.chips.includes('中国') && p.chips.includes('中'), `chips ${p && p.chips.join(' ')}`);
  check(p && p.rect.top > box.y && Math.abs(p.rect.left - box.x) < 60, `anchored below the word (top ${p && Math.round(p.rect.top)} vs y ${Math.round(box.y)})`);
  check(p && p.chars === 6, `${p && p.chars} character rows`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, 'popup.png') });

  console.log('4. j selects a shorter match; highlight follows');
  await page.keyboard.press('j');
  p = await waitPopup((x) => x && x.word !== '中国人民银行');
  check(p && p.word === '中国人', `after j: ${p && p.word}`);
  const hl = await page.evaluate(() => { const h = CSS.highlights.get('zhongwen-enhanced'); const r = h && [...h][0]; return r ? r.toString() : null; });
  check(hl === '中国人', `highlight range is ${hl}`);

  console.log('5. n moves to the next word');
  await page.keyboard.press('n');
  p = await waitPopup((x) => x && x.word !== '中国人');
  check(p && p.word === '民', `after n: ${p && p.word}`);
  await page.keyboard.press('b');
  p = await waitPopup((x) => x && x.word !== '民');
  check(p && p.word === '人民银行', `after b (back one char, longest match): ${p && p.word}`);

  console.log('6. s saves the word with its sentence; worker state agrees');
  await page.keyboard.press('s');
  p = await waitPopup((x) => x && x.saved && /Saved/.test(x.saved));
  check(p && /Saved/.test(p.saved), `button reads "${p && p.saved}"`);
  const vocab = await sw.evaluate(() => chrome.storage.local.get('vocab').then((r) => r.vocab));
  const v = vocab && vocab['人民银行'];
  check(v && v.sent === '我是中国人民银行的职员。', `saved sentence: ${v && v.sent}`);
  check(v && v.title === '测试页面' && /127\.0\.0\.1/.test(v.url), 'page title + url recorded');
  check(v && v.py === 'Ren2 min2 Yin2 hang2' && /bank/i.test(v.def), `pinyin/def stored: ${v && v.py} / ${v && v.def}`);
  await page.keyboard.press('s');
  await waitPopup((x) => x && /Save/.test(x.saved) && !/Saved/.test(x.saved));
  check(!(await sw.evaluate(() => chrome.storage.local.get('vocab').then((r) => !!r.vocab['人民银行']))), 'second s removes it');
  await page.keyboard.press('s'); // keep it saved for the Library checks below
  await waitPopup((x) => x && /Saved/.test(x.saved));

  console.log('6b. clicking a character row drills into it; back returns');
  await page.evaluate(() => document.querySelector('zhongwen-enhanced').shadowRoot.querySelectorAll('.zw-char-row')[1].click());
  p = await waitPopup((x) => x && x.word === '民');
  check(p && p.word === '民' && p.pinned, `drilled into ${p && p.word} (pinned)`);
  check(p && p.chips.length === 1 && /人民银行/.test(p.chips[0]), `back chip reads ${p && p.chips[0]}`);
  await page.evaluate(() => document.querySelector('zhongwen-enhanced').shadowRoot.querySelector('.zw-chip-back').click());
  p = await waitPopup((x) => x && x.word === '人民银行');
  check(p && p.word === '人民银行', 'back to the word');

  console.log('6c. c copies word, pinyin and meaning');
  await waitPopup((x) => x && !x.toast, 3000); // let the save toast clear
  await page.keyboard.press('c');
  p = await waitPopup((x) => x && x.toast === 'Copied');
  check(p && p.toast === 'Copied', `toast "${p && p.toast}"`);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(clip === "人民银行\tRén mín Yín háng\tPeople's Bank of China", `clipboard: ${JSON.stringify(clip)}`);

  console.log('6d. a word that stays on screen is recorded as a recent lookup');
  await page.waitForTimeout(1100);
  const recent = await sw.evaluate(() => chrome.storage.local.get('recent').then((r) => r.recent || []));
  check(recent[0] === '人民银行', `recent: ${recent.slice(0, 3).join(' ')}`);

  console.log('7. space pins; mousemove elsewhere keeps it; esc closes');
  await page.keyboard.press('Space'); // unpin (drilling pinned it)
  await waitPopup((x) => x && !x.pinned);
  await page.keyboard.press('Space');
  p = await waitPopup((x) => x && x.pinned);
  check(p && p.pinned, 'pinned');
  await page.mouse.move(600, 700);
  await page.waitForTimeout(400);
  check((await popup()) !== null, 'still open after moving away');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check((await popup()) === null, 'closed with esc');

  console.log('8. traditional text across an inline <b>: 傳統 resolves to 传统');
  await hoverChar('p2', 2);
  p = await waitPopup();
  check(p && p.word === '傳統', `word ${p && p.word}`);
  check(p && /chuán/.test(p.py), `pinyin ${p && p.py}`);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  check((await popup()) === null, 'hides when the mouse leaves the text');

  console.log('9. hovering English does nothing; a Han word mid-sentence works');
  await hoverChar('p3', 3);
  await page.waitForTimeout(400);
  check((await popup()) === null, 'no popup on "Mixed"');
  await hoverChar('p3', 16);
  p = await waitPopup();
  check(p && p.word === '学习', `word ${p && p.word}`);

  console.log('10. n at the end of a block jumps to the next block (and scrolls)');
  await hoverChar('p3', 55);
  p = await waitPopup((x) => x && x.word && x.word !== '学习');
  check(p && p.word === '中文', `start ${p && p.word}`);
  await page.keyboard.press('n');
  p = await waitPopup((x) => x && x.word === '最后');
  check(p && p.word === '最后', `after n across blocks: ${p && p.word}`);
  check((await page.evaluate(() => window.scrollY)) > 500, 'page scrolled to the word');

  console.log('10b. sentence panel: t breaks the sentence down; save; a word opens its card');
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(900, 700);
  await page.waitForTimeout(200);
  await hoverChar('p1', 12); // 今 in the second sentence
  p = await waitPopup((x) => x && x.word === '今天');
  await page.keyboard.press('t');
  const panel = () => page.evaluate(() => {
    const el = document.querySelector('zhongwen-enhanced').shadowRoot.querySelector('.zw-panel');
    if (!el) return null;
    return { words: [...el.querySelectorAll('.zw-tok .zw-han')].map((x) => x.textContent), head: el.querySelector('.zw-label').textContent, save: el.querySelector('.zw-panel-actions .zw-btn').textContent, card: el.querySelector('.zw-panel-word .zw-hero-word') ? el.querySelector('.zw-panel-word .zw-hero-word').textContent : null };
  });
  let pn = null;
  for (let i = 0; i < 40 && !(pn && pn.words.length); i++) { await page.waitForTimeout(100); pn = await panel(); }
  check(pn && pn.words.join(' ') === '今天 天气 很 好 我们 去 公园 散步 吧', `tokens: ${pn && pn.words.join(' ')}`);
  check((await popup()) === null, 'popup closed when the panel opened');
  await page.evaluate(() => document.querySelector('zhongwen-enhanced').shadowRoot.querySelectorAll('.zw-tok')[1].click());
  for (let i = 0; i < 30 && !(pn && pn.card); i++) { await page.waitForTimeout(100); pn = await panel(); }
  check(pn && pn.card === '天气', `clicked word card: ${pn && pn.card}`);
  await page.evaluate(() => document.querySelector('zhongwen-enhanced').shadowRoot.querySelector('.zw-panel-actions .zw-btn').click());
  for (let i = 0; i < 30 && !(pn && /saved/.test(pn.save)); i++) { await page.waitForTimeout(100); pn = await panel(); }
  check(pn && /Sentence saved/.test(pn.save), `save button reads "${pn && pn.save}"`);
  const sents = await sw.evaluate(() => chrome.storage.local.get('sentences').then((r) => r.sentences));
  check(sents.length === 1 && sents[0].text === '今天天气很好，我们去公园散步吧！' && sents[0].title === '测试页面', `stored sentence: ${sents[0] && sents[0].text}`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, 'sentence.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check((await panel()) === null, 'esc closes the panel');

  console.log('10c. t on a plain selection (no popup) opens the panel');
  await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('p2')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.keyboard.press('t');
  pn = null;
  for (let i = 0; i < 40 && !(pn && pn.words.length); i++) { await page.waitForTimeout(100); pn = await panel(); }
  check(pn && pn.words.includes('傳統') && pn.words.includes('中醫'), `selection tokens: ${pn && pn.words.join(' ')}`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => getSelection().removeAllRanges());

  console.log('10d. popup size 130%: still anchored to the word; tall card shrinks instead of covering it');
  await sw.evaluate(() => chrome.storage.local.get('settings').then((r) => chrome.storage.local.set({ settings: { ...r.settings, popupScale: 1.3 } })));
  await page.waitForTimeout(250);
  await page.mouse.move(900, 700);
  await page.waitForTimeout(200);
  const box2 = await hoverChar('p1', 2);
  p = await waitPopup((x) => x && x.word === '中国人民银行');
  check(p && p.rect.top > box2.y && Math.abs(p.rect.left - box2.x) < 60, `scaled popup below the word (top ${p && Math.round(p.rect.top)} vs y ${Math.round(box2.y)})`);
  check(p && p.rect.bottom <= 800 && p.rect.width > 420, `fits the viewport (bottom ${p && Math.round(p.rect.bottom)}, width ${p && Math.round(p.rect.width)})`);
  await page.keyboard.press('Escape');
  await sw.evaluate(() => chrome.storage.local.get('settings').then((r) => chrome.storage.local.set({ settings: { ...r.settings, popupScale: 1 } })));
  await page.waitForTimeout(200);

  console.log('11. turn off: popup disappears and hovering is inert');
  await sw.evaluate(() => chrome.storage.local.set({ enabled: false }));
  await page.waitForTimeout(300);
  check((await popup()) === null, 'popup gone after turning off');

  console.log('12. Library: vocabulary lists the saved word with its sentence');
  const app = await ctx.newPage();
  const errors = [];
  app.on('pageerror', (e) => errors.push(e.message));
  app.on('dialog', (d) => d.accept());
  await app.goto(`chrome-extension://${extId}/app/index.html#/vocab`);
  await app.waitForSelector('.vrow', { timeout: 5000 });
  let text = await app.evaluate(() => document.body.innerText);
  check(/人民银行/.test(text) && /RénmínYínháng/.test(text), 'row shows hanzi + pinyin');
  check(/测试页面/.test(text), 'grouped under the page title');
  await app.click('.vrow');
  await app.waitForSelector('.vdetail');
  text = await app.evaluate(() => document.querySelector('.vdetail').innerText);
  check(/我是中国人民银行的职员。/.test(text), 'detail shows the sentence');
  check(!!(await app.$('.vdetail mark')), 'word is marked inside the sentence');
  await app.screenshot({ path: resolve(OUT, 'vocab.png') });
  await app.fill('.vdetail textarea', 'central bank');
  await app.click('h1'); // blur → save
  await app.waitForTimeout(300);
  const noted = await sw.evaluate(() => chrome.storage.local.get('vocab').then((r) => r.vocab['人民银行'].note));
  check(noted === 'central bank', `note persisted: ${noted}`);

  console.log('12b. Library: exports download');
  const dl = async (fn) => { const [d] = await Promise.all([app.waitForEvent('download', { timeout: 5000 }), fn()]); return { name: d.suggestedFilename(), text: await (await import('node:fs/promises')).readFile(await d.path(), 'utf8') }; };
  await app.click('.menu .btn');
  const anki = await dl(() => app.click('.menu-list button:has-text("Anki")'));
  check(anki.name === 'zhongwen-vocab-anki.txt' && /^#separator:tab/.test(anki.text) && /人民银行\t人民銀行\tRén mín Yín háng/.test(anki.text), `anki export: ${anki.name}`);
  await app.goto(`chrome-extension://${extId}/app/index.html#/settings`);
  await app.waitForSelector('.btn-primary');
  const bk = await dl(() => app.click('button:has-text("Download backup")'));
  const parsed = JSON.parse(bk.text);
  check(parsed.app === 'zhongwen-enhanced' && parsed.data.vocab['人民银行'] && parsed.data.sentences.length === 1, `backup file: ${bk.name}`);
  await app.goto(`chrome-extension://${extId}/app/index.html#/sentences`);
  await app.waitForSelector('.vrow', { timeout: 5000 });
  await app.click('.vrow');
  await app.waitForSelector('.vdetail .zw-han', { timeout: 5000 });
  check(/今天/.test(await app.evaluate(() => document.querySelector('.vdetail').innerText)), 'sentences screen breaks a saved sentence down');
  await app.screenshot({ path: resolve(OUT, 'sentences.png') });

  console.log('13. Library: review a card');
  await app.goto(`chrome-extension://${extId}/app/index.html#/review`);
  await app.waitForSelector('.rev-card', { timeout: 5000 });
  check(/1 \/ 1/.test(await app.evaluate(() => document.querySelector('.rev-top').innerText)), 'one card queued');
  check(!(await app.$('.rev-py')), 'front hides pinyin');
  await app.keyboard.press('Space');
  await app.waitForSelector('.rev-py');
  text = await app.evaluate(() => document.querySelector('.rev-card').innerText);
  check(/RénmínYínháng/.test(text) && /People's Bank/.test(text) && /职员/.test(text), 'back shows pinyin, meaning, sentence');
  await app.screenshot({ path: resolve(OUT, 'review.png') });
  const grades = await app.evaluate(() => [...document.querySelectorAll('.grade')].map((g) => g.innerText.replace(/\s+/g, ' ')));
  check(grades.length === 4 && /Again/.test(grades[0]) && /Easy/.test(grades[3]), `grade buttons: ${grades.join(' | ')}`);
  await app.keyboard.press('3'); // Good keeps a new card in learning → it comes back this session
  await app.waitForFunction(() => document.querySelector('.rev-hint') && /again/.test(document.querySelector('.rev-top').innerText), null, { timeout: 5000 });
  check(true, 'learning card re-queued');
  await app.keyboard.press('Space');
  await app.waitForSelector('.grade');
  await app.keyboard.press('4'); // Easy graduates it
  await app.waitForSelector('.rev-done', { timeout: 5000 }).catch(async () => { console.log('    review state:', (await app.evaluate(() => document.querySelector('.main').innerText)).replace(/\n+/g, ' | ')); console.log('    srs:', JSON.stringify(await sw.evaluate(() => chrome.storage.local.get('srs').then((r) => r.srs)))); });
  const srs = await sw.evaluate(() => chrome.storage.local.get(['srs', 'daily']).then((r) => r));
  check(srs.srs['人民银行'] && srs.srs['人民银行'].reps === 2, `card graded twice (reps ${srs.srs['人民银行'] && srs.srs['人民银行'].reps})`);
  check(srs.daily && srs.daily.newDone === 1 && srs.daily.reviewDone === 1, `daily counters: new ${srs.daily && srs.daily.newDone}, review ${srs.daily && srs.daily.reviewDone}`);
  check(/2 cards reviewed/.test(await app.evaluate(() => document.body.innerText)), 'finish screen');

  console.log('14. Library: dictionary search');
  await app.goto(`chrome-extension://${extId}/app/index.html#/dictionary?q=nihao`);
  await app.waitForSelector('.wrow', { timeout: 5000 });
  text = await app.evaluate(() => document.querySelector('.list').innerText);
  check(/你好/.test(text), 'pinyin search finds 你好');
  await app.waitForSelector('.dict-card .zw-card');
  check(/nǐhǎo/.test(await app.evaluate(() => document.querySelector('.dict-card').innerText)), 'first result opens as a card');
  await app.screenshot({ path: resolve(OUT, 'dictionary.png') });
  await app.goto(`chrome-extension://${extId}/app/index.html#/dictionary?q=tradition`);
  await app.waitForFunction(() => /传统/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {});
  check(/传统/.test(await app.evaluate(() => document.body.innerText)), 'English search finds 传统');

  console.log('15. Library: a settings change reaches the page popup');
  await app.goto(`chrome-extension://${extId}/app/index.html#/settings`);
  await app.waitForSelector('.seg');
  await app.screenshot({ path: resolve(OUT, 'settings.png'), fullPage: true });
  await app.click('.seg button:has-text("Pleco")');
  await app.waitForTimeout(300);
  const pal = await sw.evaluate(() => chrome.storage.local.get('settings').then((r) => r.settings.tonePalette));
  check(pal === 'pleco', `palette saved: ${pal}`);
  await app.click('.seg button:has-text("ni3 hao3")');
  await app.waitForTimeout(200);
  await sw.evaluate(() => chrome.storage.local.set({ enabled: true }));
  await page.bringToFront();
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(900, 700);
  await page.waitForTimeout(300);
  await hoverChar('p1', 2);
  p = await waitPopup();
  check(p && p.py === 'Zhong1 guo2 Ren2 min2 Yin2 hang2', `popup now shows numbered pinyin: ${p && p.py}`);
  const t1 = await page.evaluate(() => { const el = document.querySelector('zhongwen-enhanced').shadowRoot.querySelector('.zw-t1'); return el ? getComputedStyle(el).color : null; });
  check(t1 === 'rgb(211, 47, 47)', `tone-1 color is Pleco red: ${t1}`);
  await page.keyboard.press('Escape');

  console.log('16. Library: remove a word; sentences + stats + help render');
  await app.goto(`chrome-extension://${extId}/app/index.html#/vocab`);
  await app.waitForSelector('.vrow');
  await app.click('.vrow');
  await app.click('.vdetail .btn-danger');
  await app.waitForFunction(() => /No words yet/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {});
  check(/No words yet/.test(await app.evaluate(() => document.body.innerText)), 'removed → empty state');
  for (const r of ['sentences', 'stats', 'help']) {
    await app.goto(`chrome-extension://${extId}/app/index.html#/${r}`);
    await app.waitForTimeout(250);
    check((await app.evaluate(() => document.querySelector('h1') && document.querySelector('h1').innerText)) !== null, `${r} renders`);
    await app.screenshot({ path: resolve(OUT, `${r}.png`), fullPage: true });
  }

  console.log('17. toolbar popup: switch toggles lookups, search works');
  const pop = await ctx.newPage();
  pop.on('pageerror', (e) => errors.push(e.message));
  await pop.goto(`chrome-extension://${extId}/popup/index.html`);
  await pop.waitForSelector('.switch');
  check(/Lookups are on/.test(await pop.evaluate(() => document.body.innerText)), 'shows on');
  await pop.click('.pop-head .switch');
  await pop.waitForFunction(() => /Lookups are off/.test(document.body.innerText), null, { timeout: 3000 });
  check(!(await sw.evaluate(() => chrome.storage.local.get('enabled').then((r) => r.enabled))), 'switch turned lookups off');
  await pop.fill('.pop-search input', 'xuexi');
  await pop.waitForSelector('.pop-results .wrow', { timeout: 4000 });
  check(/学习/.test(await pop.evaluate(() => document.querySelector('.pop-results').innerText)), 'popup search finds 学习');
  await pop.setViewportSize({ width: 320, height: 600 });
  await pop.screenshot({ path: resolve(OUT, 'toolbar.png') });
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await ctx.close();
  srv.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
