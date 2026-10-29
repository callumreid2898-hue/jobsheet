import { test, expect, type Page } from '@playwright/test';
import { fakeSupabase, fakeSession, signIn, SB_URL, type Row } from './fakeSupabase';

/** Password sign-in, the email-link fallback and setting a password, against the fake Supabase. */

const USER = '00000000-0000-4000-8000-0000000000e9';
const CO = '00000000-0000-4000-8000-0000000000c1';
const MGR = '00000000-0000-4000-8000-0000000000a2';

test.use({ serviceWorkers: 'block', timezoneId: 'Europe/London' });

const managerData = (): Record<string, Row[]> => ({
  profiles: [{ id: MGR, user_id: USER, company_id: CO, role: 'manager', full_name: 'Morgan Manager', email: 'mgr@test.local', active: true }],
  companies: [{ id: CO, name: 'Test Fire Ltd' }],
  jobs: [],
});

/** Answers one auth endpoint (registered after fakeSupabase, so it wins) and records request bodies. */
async function fakeAuth(page: Page, path: string, reply: (body: Row) => { status: number; body: unknown }) {
  const bodies: Row[] = [];
  await page.route(`${SB_URL}/auth/v1/${path}**`, route => {
    const body = (route.request().postDataJSON() ?? {}) as Row;
    bodies.push(body);
    const res = reply(body);
    return route.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) });
  });
  return bodies;
}

test('a manager signs in with a password and lands on their jobs', async ({ page }) => {
  await fakeSupabase(page, managerData());
  const bodies = await fakeAuth(page, 'token', ({ password }) => password === 'correct-horse'
    ? { status: 200, body: fakeSession(USER, 'mgr@test.local') }
    : { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials' } });

  await page.goto('/login');
  await page.getByLabel('Email address').fill('mgr@test.local');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/Wrong email or password/)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Password').fill('correct-horse');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/manager\/jobs$/);
  expect(bodies.map(b => b.email)).toEqual(['mgr@test.local', 'mgr@test.local']);
});

test('the email-link fallback never creates an account', async ({ page }) => {
  await fakeSupabase(page, managerData());
  const bodies = await fakeAuth(page, 'otp', () => ({ status: 200, body: {} }));

  await page.goto('/login');
  await page.getByRole('button', { name: 'Email me a sign-in link instead' }).click();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel('Email address').fill('mgr@test.local');
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  expect(bodies).toEqual([expect.objectContaining({ email: 'mgr@test.local', create_user: false })]);
});

test('an engineer sets a password from the Sync page', async ({ page }) => {
  await fakeSupabase(page, {
    profiles: [{ id: 'eng', user_id: USER, company_id: CO, role: 'engineer', full_name: 'Eng One', email: 'eng@test.local', active: true }],
    companies: [{ id: CO, name: 'Test Fire Ltd' }],
    jobs: [],
  });
  await signIn(page, USER, 'eng@test.local');
  const bodies = await fakeAuth(page, 'user', () => ({ status: 200, body: fakeSession(USER, 'eng@test.local').user }));

  await page.goto('/sync');
  await page.getByLabel('New password').fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible();

  await page.getByLabel('New password').fill('a-long-password');
  await page.getByLabel('Confirm password').fill('a-different-one');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText("The passwords don't match.")).toBeVisible();

  await page.getByLabel('Confirm password').fill('a-long-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password saved.')).toBeVisible();
  expect(bodies.filter(b => 'password' in b)).toEqual([expect.objectContaining({ password: 'a-long-password' })]);
});
