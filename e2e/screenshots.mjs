// e2e/screenshots.mjs — produce the feature screenshots in docs/screenshots/
// from the built extension: a seeded, lived-in profile on a realistic page.
//   npm run build && node e2e/screenshots.mjs
import http from 'node:http';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { gradeCard } from '../src/shared/fsrs.js';
import { dayKey } from '../src/shared/schema.js';

const require = createRequire(import.meta.url);
const pw = (() => { for (const p of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean)) { try { return require(p); } catch {} } throw new Error('playwright not found'); })();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = resolve(ROOT, 'dist');
const OUT = resolve(ROOT, 'docs/screenshots');
mkdirSync(OUT, { recursive: true });

const TITLE = '茶文化简介';
const P1 = '中国是茶的故乡。人们发现并利用茶树已经有几千年的历史了。唐代陆羽写的《茶经》是世界上第一部关于茶的专著。';
const P2 = '现在，喝茶不仅是一种习惯，也是一种生活方式。朋友见面的时候，常常一边喝茶一边聊天。';
const P3 = '绿茶、红茶、乌龙茶和普洱茶是最常见的几种茶。每种茶的味道和泡法都不一样。';
const P4 = '如果你想了解中国文化，不妨从一杯茶开始。';
const PAGE = (dark) => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${TITLE} · 阅读</title>
<style>body{margin:0;background:${dark ? '#121212' : '#fff'};color:${dark ? '#e8e4de' : '#222'};font-family:-apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:44px 32px}h1{font-size:30px;margin:0 0 6px}.meta{color:#8a8178;font-size:13px;margin-bottom:22px}p{font-size:19px;line-height:1.9;margin:0 0 14px}</style></head>
<body><div class="wrap"><h1>${TITLE}</h1><div class="meta">文化 · 阅读练习 · 3 分钟</div>
<p id="p1">${P1}</p><p id="p2">${P2}</p><p id="p3">${P3}</p><p id="p4">${P4}</p></div></body></html>`;

let dark = false;
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(PAGE(dark)); });
await new Promise((res) => srv.listen(0, res));
const port = srv.address().port;
const URL0 = `http://127.0.0.1:${port}/`;

const ctx = await pw.chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
await new Promise((r) => setTimeout(r, 800));
for (const p of ctx.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();

// ── seed a lived-in profile ──────────────────────────────────────────────────
const DAY = 86400000;
const now = Date.now();
const words = [
  ['故乡', '故鄉', 'gu4 xiang1', 'home; homeland; native place', P1, 30, 'mature'],
  ['利用', '利用', 'li4 yong4', 'to exploit; to make use of; to use', P1, 25, 'mature'],
  ['历史', '歷史', 'li4 shi3', 'history', P1, 18, 'young'],
  ['专著', '專著', 'zhuan1 zhu4', 'monograph; specialized treatise', P1, 9, 'young'],
  ['习惯', '習慣', 'xi2 guan4', 'habit; custom; usual practice', P2, 6, 'young'],
  ['生活方式', '生活方式', 'sheng1 huo2 fang1 shi4', 'way of life; lifestyle', P2, 3, 'learning'],
  ['聊天', '聊天', 'liao2 tian1', 'to chat; to gossip', P2, 2, 'learning'],
  ['乌龙茶', '烏龍茶', 'wu1 long2 cha2', 'oolong tea', P3, 1, 'new'],
  ['味道', '味道', 'wei4 dao5', 'flavor; smell', P3, 1, 'new'],
  ['不妨', '不妨', 'bu4 fang2', 'there is no harm in; might as well', P4, 0, 'new'],
];
const vocab = {};
const srs = {};
for (const [w, trad, py, def, sent, daysAgo, fam] of words) {
  vocab[w] = { w, trad: trad === w ? '' : trad, py, def, sent, url: URL0, title: TITLE, addedAt: now - daysAgo * DAY - 3600000 };
  if (fam === 'new') continue;
  let t = now - daysAgo * DAY;
  let card;
  const steps = fam === 'mature' ? 7 : fam === 'young' ? 3 : 1;
  for (let i = 0; i < steps; i++) { card = gradeCard(card, i === 0 ? 'good' : 'easy', t); t = Math.min(now - 1000, new Date(card.due).getTime() + 1000); }
  if (fam === 'learning' || w === '历史') { card = gradeCard(card, 'again', now - 2 * 3600000); card = { ...card, due: new Date(now - 600000).toISOString() }; }
  srs[w] = card;
}
const extra = [['老师', '老師', 'lao3 shi1', 'teacher', '老师说明天考试。', 'HSK 1 reading'], ['努力', '努力', 'nu3 li4', 'great effort; to strive', '只要努力，就一定能学好。', 'HSK 1 reading']];
for (const [w, trad, py, def, sent, title] of extra) vocab[w] = { w, trad: trad === w ? '' : trad, py, def, sent, url: '', title, addedAt: now - 40 * DAY };
const stats = {};
for (let i = 0; i < 120; i++) { if (i % 7 === 3 || i % 11 === 5) continue; const k = dayKey(now - i * DAY); stats[k] = { saved: (i * 7) % 5, reviewed: 4 + ((i * 13) % 17), lookups: 20 + ((i * 29) % 40) }; }
const sentences = [
  { id: 's1', text: P2, url: URL0, title: TITLE, addedAt: now - 2 * DAY, note: 'Nowadays, drinking tea is a way of life as much as a habit.' },
  { id: 's2', text: P4, url: URL0, title: TITLE, addedAt: now - DAY },
];
await sw.evaluate((seed) => chrome.storage.local.set(seed), { enabled: true, vocab, srs, stats, sentences, recent: ['唐代', '陆羽', '故乡', '茶树', '专著'], daily: null });
await new Promise((r) => setTimeout(r, 300));

// ── helpers ──────────────────────────────────────────────────────────────────
const page = await ctx.newPage();
const hoverChar = async (id, i) => {
  const box = await page.evaluate(({ id, i }) => { const el = document.getElementById(id); const n = el.firstChild; const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, { id, i });
  await page.mouse.move(box.x, box.y);
  return box;
};
const popupShown = () => page.waitForFunction(() => { const h = document.querySelector('zhongwen-enhanced'); return h && h.shadowRoot.querySelector('.zw-popup .zw-card'); }, null, { timeout: 5000 });
const shot = async (pg, name, opts = {}) => { await pg.waitForTimeout(350); await pg.screenshot({ path: resolve(OUT, name), ...opts }); console.log('  ' + name); };
const clipAround = async (sel = '.zw-popup', pad = 24) => page.evaluate(({ sel, pad }) => { const el = document.querySelector('zhongwen-enhanced').shadowRoot.querySelector(sel); const r = el.getBoundingClientRect(); return { x: Math.max(0, r.left - pad - 120), y: Math.max(0, r.top - pad - 60), width: Math.min(innerWidth, r.width + 2 * pad + 240), height: Math.min(innerHeight, r.height + 2 * pad + 60) }; }, { sel, pad });
const shadowClick = (sel, n = 0) => page.evaluate(({ sel, n }) => document.querySelector('zhongwen-enhanced').shadowRoot.querySelectorAll(sel)[n].click(), { sel, n });

// 1. hover popup, light
await page.goto(URL0);
await page.waitForTimeout(300);
await hoverChar('p1', P1.indexOf('茶树')); // 茶树
await popupShown();
await page.keyboard.press('Space'); // pin so the mouse can leave
await shot(page, 'popup-light.png');

// 2. drill into a character (pinned), chips visible
await page.keyboard.press('Escape');
await page.mouse.move(600, 700);
await page.waitForTimeout(200);
await hoverChar('p1', 33); // 《茶经》… find 专著: index of 专
const idx = P1.indexOf('专');
await hoverChar('p1', idx);
await popupShown();
await shadowClick('.zw-char-row', 1); // 著
await page.waitForFunction(() => /著/.test(document.querySelector('zhongwen-enhanced').shadowRoot.querySelector('.zw-hero-word').textContent), null, { timeout: 5000 });
await shot(page, 'popup-drill.png', { clip: await clipAround() });
await page.keyboard.press('Escape');

// 3. sentence panel
await page.mouse.move(600, 720);
await page.waitForTimeout(200);
await hoverChar('p2', P2.indexOf('习惯'));
await popupShown();
await page.keyboard.press('t');
await page.waitForFunction(() => document.querySelector('zhongwen-enhanced').shadowRoot.querySelectorAll('.zw-tok').length > 5, null, { timeout: 5000 });
await shadowClick('.zw-tok', 8);
await page.waitForFunction(() => document.querySelector('zhongwen-enhanced').shadowRoot.querySelector('.zw-panel-word .zw-card'), null, { timeout: 5000 });
await shot(page, 'sentence-panel.png');
await page.keyboard.press('Escape');

// 4. dark theme popup on a dark page
await sw.evaluate(() => chrome.storage.local.get('settings').then((r) => chrome.storage.local.set({ settings: { ...(r.settings || {}), theme: 'dark', tonePalette: 'vivid' } })));
dark = true;
await page.goto(URL0);
await page.waitForTimeout(400);
await hoverChar('p3', P3.indexOf('乌龙茶'));
await popupShown();
await page.keyboard.press('Space');
await shot(page, 'popup-dark.png');
await page.keyboard.press('Escape');
await sw.evaluate(() => chrome.storage.local.get('settings').then((r) => chrome.storage.local.set({ settings: { ...(r.settings || {}), theme: 'light', tonePalette: 'warm' } })));
dark = false;

// 5. toolbar popup
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 320, height: 520 });
await pop.goto(`chrome-extension://${extId}/popup/index.html`);
await pop.waitForSelector('.pop-stats');
await pop.fill('.pop-search input', 'chaye');
await pop.waitForSelector('.pop-results .wrow');
await shot(pop, 'toolbar.png');
await pop.close();

// 6–10. Library screens
const app = await ctx.newPage();
await app.setViewportSize({ width: 1100, height: 760 });
await app.goto(`chrome-extension://${extId}/app/index.html#/vocab`);
await app.waitForSelector('.vrow');
await app.click('.vrow >> nth=2');
await app.waitForSelector('.vdetail');
await shot(app, 'library-vocab.png');

await app.goto(`chrome-extension://${extId}/app/index.html#/review`);
await app.waitForSelector('.rev-card');
await app.keyboard.press('Space');
await app.waitForSelector('.grade');
await shot(app, 'review.png');

await app.goto(`chrome-extension://${extId}/app/index.html#/sentences`);
await app.waitForSelector('.vrow');
await app.click('.vrow');
await app.waitForSelector('.vdetail .bd-w');
await shot(app, 'sentences.png');

await app.goto(`chrome-extension://${extId}/app/index.html#/dictionary?q=tea`);
await app.waitForSelector('.dict-card .zw-card');
await shot(app, 'dictionary.png');

await app.goto(`chrome-extension://${extId}/app/index.html#/stats`);
await app.waitForSelector('.heat');
await shot(app, 'stats.png');

await app.goto(`chrome-extension://${extId}/app/index.html#/settings`);
await app.waitForSelector('.preview .zw-card');
await shot(app, 'settings.png', { clip: { x: 0, y: 0, width: 1100, height: 760 } });

await ctx.close();
srv.close();
console.log('done');
