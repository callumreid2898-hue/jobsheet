import { test, expect } from '@playwright/test';
import { fakeSupabase, signIn, today, type Row } from './fakeSupabase';

/** Manager: review a submitted job, invoice it, and find it in the right lists. Fake Supabase only. */

const MGR_USER = '00000000-0000-4000-8000-0000000000e2';
const MGR = '00000000-0000-4000-8000-0000000000a2';
const ENG = '00000000-0000-4000-8000-0000000000a1';
const CO = '00000000-0000-4000-8000-0000000000c1';
const CUST = '00000000-0000-4000-8000-0000000000d1';
const SITE = '00000000-0000-4000-8000-0000000000b1';
const JOB = '00000000-0000-4000-8000-0000000000f1';
const JS = '00000000-0000-4000-8000-0000000000f2';

function fixtures(): Record<string, Row[]> {
  const submitted = new Date().toISOString();
  return {
    profiles: [
      { id: MGR, user_id: MGR_USER, company_id: CO, role: 'manager', full_name: 'Morgan Manager', email: 'mgr@test.local' },
      { id: ENG, user_id: 'eng-user', company_id: CO, role: 'engineer', full_name: 'Eng One', email: 'eng@test.local' },
    ],
    companies: [{ id: CO, name: 'Test Fire Ltd' }],
    customers: [{ id: CUST, company_id: CO, name: 'Acme Offices' }],
    sites: [{ id: SITE, company_id: CO, customer_id: CUST, address: '1 Test Street', keyholders: [] }],
    jobs: [{
      id: JOB, company_id: CO, site_id: SITE, system_id: null, type: 'reactive_callout', template_id: 'reactive_callout',
      assigned_engineer_id: ENG, scheduled_date: today, scheduled_time: '09:00', duration_minutes: 60,
      status: 'awaiting_review', notes: null, travelling_at: null, on_site_at: submitted, completed_at: submitted,
      created_at: submitted,
    }],
    jobsheets: [{
      id: JS, job_id: JOB, company_id: CO, template_id: 'reactive_callout', answers: {},
      time_on_site: submitted, time_off_site: submitted, engineer_signature_url: null, customer_signature_url: null,
      submitted_at: submitted, pdf_path: null, created_at: submitted, updated_at: submitted,
    }],
  };
}

test.use({ serviceWorkers: 'block', timezoneId: 'Europe/London' });

test('manager: review a submitted job, invoice it, job becomes invoiced', async ({ page }) => {
  const { db, writes } = await fakeSupabase(page, fixtures());
  await signIn(page, MGR_USER, 'mgr@test.local');
  const jobPatches = () => writes.filter(w => w.method === 'PATCH' && w.table === 'jobs').map(w => w.body);

  // The dashboard tile link opens the jobs list pre-filtered
  await page.goto('/manager/jobs?status=awaiting_review');
  await expect(page.getByRole('combobox').first()).toHaveValue('awaiting_review');
  await page.getByText('1 Test Street').click();
  await expect(page).toHaveURL(new RegExp(`/manager/jobs/${JOB}$`));

  // Started jobs can't be reassigned
  await expect(page.getByLabel('Reassign engineer')).toBeDisabled();

  await page.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect.poll(jobPatches).toEqual([{ status: 'reviewed' }]);
  await expect(page.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);

  // History shows the submission and arrival from the job's own timestamps
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('job-timeline')).toContainText('Jobsheet submitted');
  await expect(page.getByTestId('job-timeline')).toContainText('Job created');

  // Invoice from the job: picker prefilled with the reviewed job
  await page.getByRole('button', { name: 'Create invoice' }).click();
  await expect(page).toHaveURL(new RegExp(`/manager/invoices/create\\?job=${JOB}$`));
  await expect(page.locator('select').filter({ has: page.locator(`option[value="${JOB}"]`) })).toHaveValue(JOB);
  await page.getByPlaceholder(/description/i).first().fill('Callout labour');
  await page.getByRole('button', { name: 'Create Invoice' }).click();

  // Invoice row first, then the job moves to invoiced
  await expect.poll(() => db.invoices?.length ?? 0).toBe(1);
  expect(db.invoices[0]).toMatchObject({ job_id: JOB, customer_id: CUST, site_id: SITE });
  await expect.poll(jobPatches).toEqual([{ status: 'reviewed' }, { status: 'invoiced' }]);
  const order = writes.map(w => `${w.method}:${w.table}`);
  expect(order.indexOf('POST:invoices')).toBeLessThan(order.lastIndexOf('PATCH:jobs'));
  expect(db.jobs[0].status).toBe('invoiced');
});

test('the Sites list opens a site, and legacy URLs go up one level', async ({ page }) => {
  await fakeSupabase(page, fixtures());
  await signIn(page, MGR_USER, 'mgr@test.local');

  await page.goto('/manager/sites');
  await page.getByText('1 Test Street').click();
  await expect(page).toHaveURL(new RegExp(`/manager/sites/${SITE}$`));

  await page.goto(`/manager/jobs/${JOB}/review`);
  await expect(page).toHaveURL(new RegExp(`/manager/jobs/${JOB}$`));
  await page.goto(`/manager/sites/${SITE}/history`);
  await expect(page).toHaveURL(new RegExp(`/manager/sites/${SITE}$`));
});

test('planner: dragging an unassigned job onto an engineer schedules it and it stays there', async ({ page }) => {
  const UNASSIGNED = '00000000-0000-4000-8000-0000000000f9';
  const data = fixtures();
  data.jobs.push({
    ...data.jobs[0], id: UNASSIGNED, assigned_engineer_id: null, status: 'unassigned',
    scheduled_time: null, on_site_at: null, completed_at: null,
  });
  const { writes } = await fakeSupabase(page, data);
  await signIn(page, MGR_USER, 'mgr@test.local');
  await page.setViewportSize({ width: 1280, height: 900 }); // the planner is a desktop screen

  await page.goto('/manager/planner');
  const card = page.getByTestId(`planner-job-${UNASSIGNED}`);
  await expect(card).toBeVisible();
  // The awaiting-review job is locked
  await expect(page.getByTestId(`planner-job-${JOB}`)).toHaveAttribute('title', /can’t be moved/);

  // Drop on Eng One's 10:00 slot (dnd-kit needs real pointer movement)
  const slot = page.locator('div.flex-shrink-0.w-44').filter({ hasText: 'Eng One' }).locator('div.relative.p-1').nth(2);
  const from = (await card.boundingBox())!;
  const to = (await slot.boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();

  await expect.poll(() => writes.filter(w => w.method === 'PATCH').map(w => w.body)).toEqual([
    { assigned_engineer_id: ENG, scheduled_time: '10:00', status: 'scheduled' },
  ]);
  // No snap-back: the card is now in the 10:00 slot
  await expect(slot.getByTestId(`planner-job-${UNASSIGNED}`)).toBeVisible();
});
