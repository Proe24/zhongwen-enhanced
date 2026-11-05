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

  console.log('6b. clicking a character row drills into it; back returns');
  await page.evaluate(() => document.querySelector('zhongwen-enhanced').shadowRoot.querySelectorAll('.zw-char-row')[1].click());
  p = await waitPopup((x) => x && x.word === '民');
  check(p && p.word === '民' && p.pinned, `drilled into ${p && p.word} (pinned)`);
  check(p && p.chips.length === 1 && /人民银行/.test(p.chips[0]), `back chip reads ${p && p.chips[0]}`);
  await page.evaluate(() => document.querySelector('zhongwen-enhanced').shadowRoot.querySelector('.zw-chip-back').click());
  p = await waitPopup((x) => x && x.word === '人民银行');
  check(p && p.word === '人民银行', 'back to the word');

  console.log('6c. c copies word, pinyin and meaning');
  await page.keyboard.press('c');
  p = await waitPopup((x) => x && x.toast);
  check(p && p.toast === 'Copied', `toast "${p && p.toast}"`);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(clip === "人民银行\tRén mín Yín háng\tPeople's Bank of China", `clipboard: ${JSON.stringify(clip)}`);

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

  console.log('11. turn off: popup disappears and hovering is inert');
  await sw.evaluate(() => chrome.storage.local.set({ enabled: false }));
  await page.waitForTimeout(300);
  check((await popup()) === null, 'popup gone after turning off');

  console.log('12. extension pages load');
  const app = await ctx.newPage();
  await app.goto(`chrome-extension://${extId}/app/index.html#/vocab`);
  await app.waitForTimeout(800);
  const appText = await app.evaluate(() => document.body.innerText);
  check(/Zhongwen/.test(appText), 'library renders');
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/popup/index.html`);
  await pop.waitForTimeout(600);
  check(/Turn on|Turn off|On|Off/.test(await pop.evaluate(() => document.body.innerText)), 'toolbar popup renders');
  const errors = [];
  for (const pg of [page, app, pop]) pg.on('pageerror', (e) => errors.push(e.message));
} finally {
  await ctx.close();
  srv.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
