// icons.mjs — render the extension icon (a geometric 中 on terracotta) to PNGs.
// Uses the Playwright Chromium that is already installed; no font needed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = (() => { for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(p); } catch {} } throw new Error('playwright not found'); })();

export const ICON_SVG = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E88A6C"/><stop offset="1" stop-color="#C95A3C"/></linearGradient></defs>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#g)"/>
  <g fill="none" stroke="#FFF7EF" stroke-linecap="round" stroke-linejoin="round">
    <rect x="30" y="42" width="68" height="40" rx="5" stroke-width="11"/>
    <line x1="64" y1="18" x2="64" y2="110" stroke-width="12"/>
  </g>
</svg>`;

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/icons/icon.svg', import.meta.url), ICON_SVG(128));
const browser = await pw.chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${ICON_SVG(size)}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(new URL(`../public/icons/icon${size}.png`, import.meta.url), png);
  console.log(`icon${size}.png ${png.length} B`);
}
await browser.close();
