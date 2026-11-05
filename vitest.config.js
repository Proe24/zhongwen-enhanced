import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: { environment: 'node', include: ['test/**/*.test.{js,jsx}'] },
});
