// Vite config for the extension PAGES and the BACKGROUND service worker.
// The content script is built separately (vite.content.config.js) because it
// must be a single classic script with its CSS inlined.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const __dirname = import.meta.dirname;

export default defineConfig({
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome120',
    modulePreload: false,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'src/app/index.html'),
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/index.js'),
      },
      output: {
        entryFileNames: (c) => (c.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
