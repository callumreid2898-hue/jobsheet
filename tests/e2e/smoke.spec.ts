import { test, expect } from '@playwright/test';

/**
 * Smoke tests — these run against a production build served by `vite preview`.
 * They test public routes that don't require Supabase auth.
 *
 * For tests that require auth, set up a Supabase local instance with seed data
 * and configure VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.test.
 */

test.describe('Public routes', () => {
  test('login page loads and shows magic-link form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /send/i })).toBeVisible();
  });

  test('unauthenticated visit to / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated visit to /jobs redirects to /login', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated visit to /manager/jobs redirects to /login', async ({ page }) => {
    await page.goto('/manager/jobs');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('PWA', () => {
  test('app has a web manifest', async ({ page }) => {
    await page.goto('/login');
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveAttribute('href', /manifest/);
  });

  test('page has viewport meta tag', async ({ page }) => {
    await page.goto('/login');
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute('content', /width=device-width/);
  });
});
