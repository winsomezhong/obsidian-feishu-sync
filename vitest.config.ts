import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, 'tests/mocks/obsidian.ts'),
    },
  },
});
