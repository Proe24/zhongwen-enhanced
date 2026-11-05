// Vite config for the CONTENT script: one IIFE, CSS imported as a string and
// injected into the popup's shadow root at runtime.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const __dirname = import.meta.dirname;

export default defineConfig({
  root: 'src',
  publicDir: false,
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'chrome120',
    lib: {
      entry: resolve(__dirname, 'src/content/index.jsx'),
      formats: ['iife'],
      name: 'ZhongwenEnhanced',
      fileName: () => 'content.js',
    },
  },
});
