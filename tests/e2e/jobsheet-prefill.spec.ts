import { test, expect, type Page } from '@playwright/test';
import { fakeSupabase, signIn, today, type Row } from './fakeSupabase';

/**
 * Corrective maintenance: the manager's job details pre-fill the engineer's sheet,
 * and the site's Jobsheets tab splits sheets by type. Fake Supabase only.
 */

const MGR_USER = '00000000-0000-4000-8000-0000000000e2';
const ENG_USER = '00000000-0000-4000-8000-0000000000e1';
const MGR = '00000000-0000-4000-8000-0000000000a2';
const ENG = '00000000-0000-4000-8000-0000000000a1';
const CO = '00000000-0000-4000-8000-0000000000c1';
const CUST = '00000000-0000-4000-8000-0000000000d1';
const SITE = '00000000-0000-4000-8000-0000000000b1';
const JOB = '00000000-0000-4000-8000-0000000000f1';
const JOB2 = '00000000-0000-4000-8000-0000000000f3';

function fixtures(): Record<string, Row[]> {
  const now = Date.now();
  return {
    profiles: [
      { id: MGR, user_id: MGR_USER, company_id: CO, role: 'manager', full_name: 'Morgan Manager', email: 'mgr@test.local' },
      { id: ENG, user_id: ENG_USER, company_id: CO, role: 'engineer', full_name: 'Eng One', email: 'eng@test.local' },
    ],
    companies: [{ id: CO, name: 'Test Fire Ltd' }],
    customers: [{ id: CUST, company_id: CO, name: 'Acme Offices' }],
    sites: [{ id: SITE, company_id: CO, customer_id: CUST, name: 'Test Site', address: '1 Test Street', job_codes: ['FS1001', 'FS1001/2'], keyholders: [], client_no: 'C-88' }],
    systems: [],
    jobs: [{
      id: JOB, company_id: CO, site_id: SITE, system_id: null, type: 'reactive_callout', template_id: 'corrective_maintenance',
      assigned_engineer_id: ENG, scheduled_date: today, scheduled_time: null, duration_minutes: null,
      status: 'on_site', notes: null, client_no: 'C-88', call_no: '4471', reported_fault: 'Zone 3 fault on panel',
      travelling_at: new Date(now - 75 * 60000).toISOString(), on_site_at: new Date(now - 30 * 60000).toISOString(),
      completed_at: null, created_at: new Date(now - 86400000).toISOString(),
    }],
    jobsheets: [],
    remedials: [],
    photos: [],
  };
}

/** The form-engine field wrapper that contains a given label */
const field = (page: Page, label: string) =>
  page.locator('div.px-4.py-3').filter({ has: page.locator('label', { hasText: label }) });

test.use({ serviceWorkers: 'block', timezoneId: 'Europe/London' });

test('manager: a new job takes the site\'s client no. and records call no. and reported fault', async ({ page }) => {
  const { writes } = await fakeSupabase(page, { ...fixtures(), jobs: [] });
  await signIn(page, MGR_USER, 'mgr@test.local');

  await page.goto('/manager/jobs/create');
  await page.locator('label:has-text("Customer") + select').selectOption(CUST);
  await page.locator('label:has-text("Site") + select').selectOption(SITE);
  await page.locator('label:has-text("Template") + select').selectOption('corrective_maintenance');
  await expect(page.locator('label:text-is("Client No") + input')).toHaveValue('C-88');
  await page.locator('label:text-is("Call No") + input').fill('5120');
  await page.locator('label:text-is("Reported fault") + textarea').fill('Sounder not working in kitchen');
  await page.getByRole('button', { name: 'Create Job' }).click();

  await expect.poll(() => writes.filter(w => w.table === 'jobs').length).toBe(1);
  expect(writes.find(w => w.table === 'jobs')!.body).toMatchObject({
    template_id: 'corrective_maintenance', client_no: 'C-88', call_no: '5120', reported_fault: 'Sounder not working in kitchen',
  });
  // The site already had a client no., so it isn't touched
  expect(writes.filter(w => w.table === 'sites')).toHaveLength(0);
});

test('engineer: the corrective maintenance sheet opens pre-filled and times are stamped at submit', async ({ page }) => {
  const { db } = await fakeSupabase(page, fixtures());
  await signIn(page, ENG_USER, 'eng@test.local');

  await page.goto(`/jobs/${JOB}/fill`);
  await expect(field(page, 'Site name & address').locator('input')).toHaveValue('Test Site, 1 Test Street');
  await expect(field(page, 'Call No').locator('input')).toHaveValue('4471');
  await expect(field(page, 'Client No').locator('input')).toHaveValue('C-88');
  await expect(field(page, 'Job type').locator('select')).toHaveValue('Call out');
  await expect(field(page, 'Reported fault').locator('textarea')).toHaveValue('Zone 3 fault on panel');
  await expect(field(page, 'Travel time').locator('input')).toHaveValue('45m');
  await expect(field(page, 'Time arrival').locator('input')).toHaveValue(/^\d\d:\d\d$/);
  await expect(field(page, 'Engineer Name').locator('input')).toHaveValue('Eng One');
  // What happened on site is left to the engineer
  await expect(field(page, 'Action taken').locator('textarea')).toHaveValue('');
  await expect(field(page, 'Further action required').locator('textarea')).toHaveValue('');

  // The reported fault can be edited
  await field(page, 'Reported fault').locator('textarea').fill('Zone 3 fault — detector 7 open circuit');
  await field(page, 'Action taken').locator('textarea').fill('Replaced detector head, reset panel');
  await field(page, 'System left in full working order').getByRole('button', { name: 'Yes' }).click();

  const sig = field(page, 'Engineer Signature');
  await sig.locator('canvas').scrollIntoViewIfNeeded();
  const box = (await sig.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await sig.getByRole('button', { name: 'Save signature' }).click();
  await expect(sig.getByAltText('Signature')).toBeVisible();

  await page.getByRole('button', { name: 'Submit Jobsheet' }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${JOB}/submitted$`));

  await expect.poll(() => db.jobsheets[0]?.submitted_at ?? null).toBeTruthy();
  const answers = db.jobsheets[0].answers as Row;
  expect(answers).toMatchObject({
    call_no: '4471',
    reported_fault: 'Zone 3 fault — detector 7 open circuit',
    action_taken: 'Replaced detector head, reset panel',
    time_on_site: '30m', // arrival to departure
  });
  expect(answers.time_depart).toMatch(/^\d\d:\d\d$/);
});

test('site Jobsheets tab: sub-sections per sheet type', async ({ page }) => {
  const f = fixtures();
  const at = new Date().toISOString();
  const sheet = (id: string, jobId: string, template: string, submitted: boolean) => ({
    id, job_id: jobId, company_id: CO, template_id: template, answers: {},
    time_on_site: at, time_off_site: null, engineer_signature_url: null, customer_signature_url: null,
    submitted_at: submitted ? at : null, pdf_path: null, created_at: at, updated_at: at,
  });
  f.jobs.push({ ...f.jobs[0], id: JOB2, template_id: 'fire_alarm_inspection', type: 'ppm_service', status: 'awaiting_review' });
  f.jobsheets = [
    sheet('00000000-0000-4000-8000-0000000000f2', JOB, 'corrective_maintenance', false),
    sheet('00000000-0000-4000-8000-0000000000f4', JOB2, 'fire_alarm_inspection', true),
  ];
  await fakeSupabase(page, f);
  await signIn(page, MGR_USER, 'mgr@test.local');

  await page.goto(`/manager/sites/${SITE}`);
  await expect(page.getByText('C-88')).toBeVisible(); // client no. on the overview
  await expect(page.getByText('FS1001/2')).toBeVisible(); // job codes too
  await page.getByRole('button', { name: 'Jobsheets' }).click();

  await expect(page.getByRole('button', { name: 'All (2)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Corrective Maintenance (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fire Alarm Inspection (1)' })).toBeVisible();
  await expect(page.getByText('In progress')).toBeVisible();
  await expect(page.getByText(/PDF pending/)).toBeVisible();

  await page.getByRole('button', { name: 'Fire Alarm Inspection (1)' }).click();
  await expect(page).toHaveURL(/sheet=fire_alarm_inspection/);
  await expect(page.getByText('In progress')).toHaveCount(0);
  await expect(page.getByText(/PDF pending/)).toBeVisible();

  // A row opens the job's Jobsheet tab
  await page.getByText('Fire Alarm Inspection', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/manager/jobs/${JOB2}\\?tab=jobsheet$`));
});
