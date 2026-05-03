import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Stub the cloudflare:workers virtual module so unit tests can import
      // API endpoint files without pulling in the Workers runtime. Tests
      // exercise the exported handle*() functions directly with an injected
      // env, so the imported `env` is never actually read in test code.
      'cloudflare:workers': fileURLToPath(
        new URL('./tests/unit/__mocks__/cloudflare-workers.ts', import.meta.url),
      ),
    },
  },
});
