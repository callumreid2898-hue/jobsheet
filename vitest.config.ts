import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    globals: true,
    alias: { '@': '/src' },
    include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
  },
});
