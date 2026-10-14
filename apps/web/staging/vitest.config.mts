import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  cacheDir: '/tmp/doorman-vite',
  test: { include: ['staging/staging.test.ts'], testTimeout: 15_000 },
});
