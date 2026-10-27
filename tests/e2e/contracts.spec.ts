import { test, expect } from '@playwright/test';
import { fakeSupabase, signIn, today, type Row } from './fakeSupabase';

/** PPM: a due contract creates its visit's job and opens it. Fake Supabase only. */

const MGR_USER = '00000000-0000-4000-8000-0000000000e2';
const MGR = '00000000-0000-4000-8000-0000000000a2';
const ENG = '00000000-0000-4000-8000-0000000000a1';
const CO = '00000000-0000-4000-8000-0000000000c1';
const CUST = '00000000-0000-4000-8000-0000000000d1';
const SITE = '00000000-0000-4000-8000-0000000000b1';
const CONTRACT = '00000000-0000-4000-8000-0000000000c9';
const NEW_JOB = '00000000-0000-4000-8000-0000000000f7';

test.use({ serviceWorkers: 'block', timezoneId: 'Europe/London' });

test('a contract due today creates its visit job and opens it', async ({ page }) => {
  const data: Record<string, Row[]> = {
    profiles: [
      { id: MGR, user_id: MGR_USER, company_id: CO, role: 'manager', full_name: 'Morgan Manager', email: 'mgr@test.local', active: true },
      { id: ENG, user_id: 'eng-user', company_id: CO, role: 'engineer', full_name: 'Eng One', email: 'eng@test.local', active: true },
    ],
    companies: [{ id: CO, name: 'Test Fire Ltd' }],
    customers: [{ id: CUST, company_id: CO, name: 'Acme Offices' }],
    sites: [{ id: SITE, company_id: CO, customer_id: CUST, name: '1 Test Street', address: '1 Test Street', job_codes: [], keyholders: [] }],
    contracts: [{
      id: CONTRACT, company_id: CO, site_id: SITE, customer_id: CUST, system_id: null, reference: 'FA-1',
      system_type: 'fire_alarm', visit_frequency: 'annual', next_visit_due: today, start_date: null, end_date: null,
      status: 'active', notes: null, created_at: '', updated_at: '',
    }],
    contract_visits: [],
    jobs: [],
  };
  const { writes } = await fakeSupabase(page, data, {
    generate_visit_job: (args, db) => {
      db.jobs.push({
        id: NEW_JOB, company_id: CO, site_id: SITE, system_id: null, type: 'ppm_service', template_id: 'fire_alarm_service',
        assigned_engineer_id: args.p_engineer_id, scheduled_date: args.p_date, scheduled_time: null, duration_minutes: null,
        status: 'scheduled', notes: 'PPM visit · FA-1', travelling_at: null, on_site_at: null, completed_at: null, created_at: '',
      });
      db.contract_visits.push({ id: 'v1', contract_id: CONTRACT, company_id: CO, job_id: NEW_JOB, scheduled_date: args.p_date, status: 'scheduled', created_at: '' });
      return { body: NEW_JOB };
    },
  });
  await signIn(page, MGR_USER, 'mgr@test.local');

  await page.goto(`/manager/contracts/${CONTRACT}`);
  await expect(page.getByTestId('due-state')).toHaveText('Due today');
  await page.getByLabel('Engineer for the visit').selectOption(ENG);
  await page.getByRole('button', { name: 'Create job for this visit' }).click();

  await expect(page).toHaveURL(new RegExp(`/manager/jobs/${NEW_JOB}$`));
  expect(writes.find(w => w.table === 'generate_visit_job')!.body)
    .toEqual({ p_contract_id: CONTRACT, p_date: today, p_engineer_id: ENG });

  // Back on the contract, the next visit links to the job instead of offering another
  await page.goto(`/manager/contracts/${CONTRACT}`);
  await expect(page.getByRole('link', { name: 'open job' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create job for this visit' })).toHaveCount(0);
});
