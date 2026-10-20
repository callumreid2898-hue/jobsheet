import { test, expect } from '@playwright/test';
import { fakeSupabase, signIn, type Row } from './fakeSupabase';

/** Onboarding, removed users and the Team page, against the fake Supabase. */

const USER = '00000000-0000-4000-8000-0000000000e9';
const CO = '00000000-0000-4000-8000-0000000000c1';
const MGR = '00000000-0000-4000-8000-0000000000a2';
const ENG = '00000000-0000-4000-8000-0000000000a1';

test.use({ serviceWorkers: 'block', timezoneId: 'Europe/London' });

test('first login with no profile and no invite: create a company and land on the dashboard', async ({ page }) => {
  const data: Record<string, Row[]> = { profiles: [], companies: [] };
  const { writes } = await fakeSupabase(page, data, {
    claim_invite: () => ({ body: false }),
    create_company_and_manager: (args, db) => {
      db.companies.push({ id: CO, name: args.p_company_name });
      db.profiles.push({
        id: MGR, user_id: USER, company_id: CO, role: 'manager', full_name: args.p_full_name,
        email: 'founder@test.local', active: true,
      });
      return { body: CO };
    },
  });
  await signIn(page, USER, 'founder@test.local');

  // Any protected route shows onboarding, never the page itself
  await page.goto('/manager/dashboard');
  await expect(page.getByRole('heading', { name: 'Set up your company' })).toBeVisible();
  expect(writes.filter(w => w.method === 'RPC').map(w => w.table)).toEqual(['claim_invite']);

  await page.getByLabel('Company name').fill('New Fire Ltd');
  await page.getByLabel('Your name').fill('Fran Founder');
  await page.getByRole('button', { name: 'Create company' }).click();

  await expect(page).toHaveURL(/\/manager\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Set up your company' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  expect(writes.find(w => w.table === 'create_company_and_manager')!.body)
    .toEqual({ p_company_name: 'New Fire Ltd', p_full_name: 'Fran Founder' });
});

test('a removed member sees "access removed" instead of the app', async ({ page }) => {
  await fakeSupabase(page, {
    profiles: [{ id: ENG, user_id: USER, company_id: CO, role: 'engineer', full_name: 'Eng One', email: 'e@test.local', active: false }],
    companies: [{ id: CO, name: 'Test Fire Ltd' }],
    jobs: [],
  });
  await signIn(page, USER, 'e@test.local');
  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: 'Your access has been removed' })).toBeVisible();
  // Nothing from the company is left in this device's database
  const cachedProfiles = await page.evaluate(() => new Promise<number>(resolve => {
    const open = indexedDB.open('jobsheet-pwa');
    open.onsuccess = () => {
      const tx = open.result.transaction('profiles', 'readonly');
      const req = tx.objectStore('profiles').count();
      req.onsuccess = () => resolve(req.result);
    };
    open.onerror = () => resolve(-1);
  }));
  expect(cachedProfiles).toBe(0);
});

test('team page: invite (function not deployed), remove an engineer', async ({ page }) => {
  page.on('dialog', d => d.accept());
  const data: Record<string, Row[]> = {
    profiles: [
      { id: MGR, user_id: USER, company_id: CO, role: 'manager', full_name: 'Morgan Manager', email: 'mgr@test.local', active: true },
      { id: ENG, user_id: 'eng-user', company_id: CO, role: 'engineer', full_name: 'Eng One', email: 'eng@test.local', active: true },
    ],
    companies: [{ id: CO, name: 'Test Fire Ltd' }],
    invites: [],
  };
  const { writes } = await fakeSupabase(page, data, {
    remove_member: (args, db) => {
      db.profiles.find(p => p.id === args.p_profile_id)!.active = false;
      return { body: 2 };
    },
  });
  await signIn(page, USER, 'mgr@test.local');
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('/manager/team');
  await expect(page.getByTestId('team-members')).toContainText('Eng One');

  await page.getByLabel('Email').fill('New.Eng@Test.local');
  await page.getByLabel('Name').fill('New Eng');
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByRole('status')).toContainText('Supabase dashboard');
  expect(data.invites).toEqual([expect.objectContaining({ email: 'new.eng@test.local', role: 'engineer', company_id: CO, full_name: 'New Eng' })]);
  await expect(page.getByText('Pending invites')).toBeVisible();

  const engRow = page.getByTestId('team-members').locator('li').filter({ hasText: 'Eng One' });
  await engRow.getByRole('button', { name: 'Remove' }).click();
  await expect.poll(() => writes.filter(w => w.table === 'remove_member').map(w => w.body)).toEqual([{ p_profile_id: ENG }]);
  await expect(page.getByText(/2 jobs are back in Unassigned/)).toBeVisible();
  await expect(engRow).toContainText('Removed');
  await expect(engRow.getByRole('button', { name: 'Restore' })).toBeVisible();
  // You can't remove yourself
  await expect(page.getByTestId('team-members').locator('li').filter({ hasText: '(you)' }).getByRole('button', { name: 'Remove' })).toHaveCount(0);
});
