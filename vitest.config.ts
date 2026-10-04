import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/desktop/src/**/*.test.{ts,tsx}', 'apps/mobile/src/**/*.test.ts'],
    environment: 'node',
  },
});
