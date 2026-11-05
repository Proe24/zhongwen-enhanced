// build.mjs — produce dist/ (an unpacked extension) and optionally a store zip.
//   node scripts/build.mjs          → dist/
//   node scripts/build.mjs --zip    → dist/ + zhongwen-enhanced-<version>.zip
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

await build({ configFile: join(ROOT, 'vite.config.js'), logLevel: 'warn' });
await build({ configFile: join(ROOT, 'vite.content.config.js'), logLevel: 'warn' });

// manifest: version comes from package.json so there is one place to bump
const manifest = JSON.parse(readFileSync(join(ROOT, 'src/manifest.json'), 'utf8'));
manifest.version = pkg.version;
writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
// vite's lib build emits a stray style.css for ?inline imports on some versions — drop it
for (const f of readdirSync(DIST)) if (/^style\.css$/.test(f)) rmSync(join(DIST, f));

const size = (p) => statSync(p).size;
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`dist/content.js    ${kb(size(join(DIST, 'content.js')))}`);
console.log(`dist/background.js ${kb(size(join(DIST, 'background.js')))}`);

if (process.argv.includes('--zip')) {
  const files = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files[relative(DIST, p).split('\\').join('/')] = readFileSync(p);
    }
  };
  walk(DIST);
  const out = join(ROOT, `zhongwen-enhanced-${pkg.version}.zip`);
  if (existsSync(out)) rmSync(out);
  writeFileSync(out, zipSync(files, { level: 9 }));
  console.log(`wrote ${relative(ROOT, out)} (${kb(size(out))})`);
}
