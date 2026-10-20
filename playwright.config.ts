import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['iPhone 14 Pro'] },
    },
  ],
  // Run against a production build so the PWA manifest / service worker exist.
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});
