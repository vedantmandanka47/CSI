import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['../../tests/unit/shared/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@csi/shared': resolve(__dirname, 'src/index.ts'),
    },
  },
});
