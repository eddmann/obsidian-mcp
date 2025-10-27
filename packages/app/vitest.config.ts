import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: [
      'tests/behavior/**/*.spec.ts',
      'tests/contracts/**/*.spec.ts',
      'tests/http/**/*.spec.ts',
      'tests/unit/**/*.spec.ts',
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@tests': path.resolve(__dirname, 'tests'),
    },
  },
});
