// e2e/store-assets.mjs — Chrome Web Store assets from the built extension:
// 1280×800 screenshots (opaque PNG, as the store requires) and a 440×280
// small promo tile. Reuses the seeded page from screenshots.mjs.
//   npm run build && node e2e/store-assets.mjs   → store/
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = (() => { for (const p of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean)) { try { return require(p); } catch {} } throw new Error('playwright not found'); })();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'store');
mkdirSync(OUT, { recursive: true });

// 1. screenshots: run the feature screenshot script at the store size, dpr 1
process.env.SHOT_W = '1280'; process.env.SHOT_H = '800'; process.env.SHOT_DPR = '1'; process.env.SHOT_OUT = OUT;
execFileSync(process.execPath, [resolve(ROOT, 'e2e/screenshots.mjs')], { stdio: 'inherit', env: process.env });

// 2. promo tile 440×280
const browser = await pw.chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
const icon = readFileSync(resolve(ROOT, 'public/icons/icon.svg'), 'utf8');
await page.setContent(`<html><body style="margin:0;width:440px;height:280px;background:#F4F0E7;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#2A2521;display:flex;align-items:center;gap:26px;padding:0 34px;box-sizing:border-box">
<div style="width:96px;height:96px;flex-shrink:0">${icon.replace('width="128" height="128"', 'width="96" height="96"')}</div>
<div><div style="font-size:26px;font-weight:700;line-height:1.1;letter-spacing:-0.01em">Zhongwen Enhanced</div>
<div style="font-size:14px;color:#6B615A;margin-top:8px;line-height:1.45">Hover Chinese for pinyin and meaning. Save words with their sentence, review with spaced repetition.</div>
<div style="margin-top:12px;font-size:20px;font-family:'PingFang SC','Noto Sans CJK SC',sans-serif"><span style="color:#C25A4E">中</span><span style="color:#4E8A55">文</span><span style="color:#3E6FA8">好</span><span style="color:#8A569E">读</span><span style="font-size:12px;color:#998F84;margin-left:10px;font-family:-apple-system,sans-serif">offline · private · free</span></div></div></body></html>`);
writeFileSync(resolve(OUT, 'promo-small-440x280.png'), await page.screenshot({ clip: { x: 0, y: 0, width: 440, height: 280 } }));
await browser.close();
console.log('store/ ready');
