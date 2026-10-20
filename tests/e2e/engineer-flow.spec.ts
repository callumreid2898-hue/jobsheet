import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Engineer path from Today to submit, against an in-memory fake of Supabase's
 * REST/RPC/auth/storage endpoints. No real project is contacted.
 */

function supabaseUrl(): string {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  const env = readFileSync('.env.local', 'utf8');
  const m = env.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error('VITE_SUPABASE_URL not set');
  return m[1].trim();
}

const SB_URL = supabaseUrl();
const STORAGE_KEY = `sb-${new URL(SB_URL).hostname.split('.')[0]}-auth-token`;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

const USER_ID = '00000000-0000-4000-8000-0000000000e1';
const PROFILE_ID = '00000000-0000-4000-8000-0000000000p1'.replace('p', 'a');
const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1';
const SITE_ID = '00000000-0000-4000-8000-0000000000s1'.replace('s', 'b');
const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000d1';
const JOB_ID = '00000000-0000-4000-8000-0000000000f1';

type Row = Record<string, unknown>;

function fixtures(): Record<string, Row[]> {
  return {
    profiles: [{ id: PROFILE_ID, user_id: USER_ID, company_id: COMPANY_ID, role: 'engineer', full_name: 'Eng One', email: 'eng@test.local' }],
    companies: [{ id: COMPANY_ID, name: 'Test Fire Ltd' }],
    customers: [{ id: CUSTOMER_ID, company_id: COMPANY_ID, name: 'Acme Offices' }],
    sites: [{ id: SITE_ID, company_id: COMPANY_ID, customer_id: CUSTOMER_ID, address: '1 Test Street' }],
    systems: [],
    jobs: [{
      id: JOB_ID, company_id: COMPANY_ID, site_id: SITE_ID, system_id: null,
      type: 'reactive_callout', template_id: 'reactive_callout',
      assigned_engineer_id: PROFILE_ID, scheduled_date: today, scheduled_time: null,
      status: 'scheduled', notes: null, travelling_at: null, on_site_at: null, completed_at: null,
      created_at: new Date().toISOString(),
    }],
    jobsheets: [],
    remedials: [],
    photos: [],
  };
}

interface Write { method: string; table: string; body: unknown; prefer: string }
interface Upload { bucket: string; path: string; body: string }

/** A small stateful PostgREST fake: eq filters, single-object Accept, upsert by id, PATCH, set_job_status. */
async function fakeSupabase(page: Page) {
  const db = fixtures();
  const writes: Write[] = [];
  const uploads: Upload[] = [];

  const filterRows = (rows: Row[], params: URLSearchParams) => rows.filter(r =>
    [...params.entries()].every(([k, v]) => !v.startsWith('eq.') || String(r[k]) === v.slice(3)));

  await page.route(`${SB_URL}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.startsWith('/auth/v1/')) return json(200, {});
    // Uploads: POST /storage/v1/object/{bucket}/{path}. Downloads/signing aren't needed (files are still local).
    const upload = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (upload && req.method() === 'POST') {
      uploads.push({ bucket: upload[1], path: decodeURIComponent(upload[2]), body: (req.postDataBuffer() ?? Buffer.alloc(0)).toString('latin1') });
      return json(200, { Key: `${upload[1]}/${upload[2]}` });
    }
    if (path.startsWith('/storage/v1/')) return json(400, { error: 'not found', message: 'Object not found' });

    if (path === '/rest/v1/rpc/set_job_status') {
      const { p_job_id, p_status } = req.postDataJSON();
      writes.push({ method: 'RPC', table: 'set_job_status', body: { p_job_id, p_status }, prefer: '' });
      const job = db.jobs.find(j => j.id === p_job_id)!;
      job.status = p_status;
      return json(200, job);
    }

    const table = path.replace('/rest/v1/', '');
    const rows = (db[table] ??= []);
    const method = req.method();

    if (method === 'GET' || method === 'HEAD') {
      const found = filterRows(rows, url.searchParams);
      if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
        return found.length === 1
          ? json(200, found[0])
          : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      }
      return json(200, found);
    }

    if (method === 'POST') {
      const body = req.postDataJSON();
      writes.push({ method, table, body, prefer: req.headers()['prefer'] ?? '' });
      const ignore = (req.headers()['prefer'] ?? '').includes('ignore-duplicates');
      for (const row of Array.isArray(body) ? body : [body]) {
        const i = rows.findIndex(r => r.id === row.id);
        if (i === -1) rows.push(row);
        else if (!ignore) rows[i] = { ...rows[i], ...row };
      }
      return route.fulfill({ status: 201, body: '' });
    }

    if (method === 'PATCH') {
      const body = req.postDataJSON();
      writes.push({ method, table, body, prefer: '' });
      for (const r of filterRows(rows, url.searchParams)) Object.assign(r, body);
      return route.fulfill({ status: 204, body: '' });
    }

    return json(200, {});
  });

  return { db, writes, uploads };
}

// 2x2 red PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAwMDAwMAAAA0ZAQDs3p7mAAAAAElFTkSuQmCC',
  'base64',
);

async function signIn(page: Page) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', exp })}.sig`;
  const session = {
    access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh',
    user: {
      id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'eng@test.local',
      app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
    },
  };
  await page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, [STORAGE_KEY, JSON.stringify(session)] as const);
}

/** The field wrapper that contains a given label */
const field = (page: Page, label: string) =>
  page.locator('div.px-4.py-3').filter({ has: page.locator('label', { hasText: label }) });

test.use({ serviceWorkers: 'block', timezoneId: 'Europe/London' });

test('engineer: travel, arrive, fill, submit once, cannot resubmit', async ({ page }) => {
  const { db, writes, uploads } = await fakeSupabase(page);
  await signIn(page);
  const rpcs = () => writes.filter(w => w.method === 'RPC').map(w => (w.body as Row).p_status);

  // Today → Travelling
  await page.goto('/today');
  await expect(page.getByText('Reactive Callout')).toBeVisible();
  await page.getByRole('button', { name: 'Travelling' }).click();
  await expect.poll(rpcs).toEqual(['travelling']);
  await expect(page.getByRole('button', { name: 'Arrived on site' })).toBeVisible();

  // Job detail → Arrived on site → straight into the jobsheet
  await page.getByText('Reactive Callout').click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${JOB_ID}$`));
  await page.getByRole('button', { name: 'Arrived on site' }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${JOB_ID}/fill$`));
  await expect.poll(rpcs).toEqual(['travelling', 'on_site']);

  // The new jobsheet is queued as an insert-ignore-duplicates
  await expect.poll(() => writes.filter(w => w.table === 'jobsheets').length).toBe(1);
  const created = writes.find(w => w.table === 'jobsheets')!;
  expect(created.prefer).toContain('ignore-duplicates');
  const jobsheetId = (created.body as Row).id;

  // Validation blocks an empty submit
  await page.getByRole('button', { name: 'Submit Jobsheet' }).click();
  await expect(page.getByText(/fields? needs? attention/)).toBeVisible();
  await expect(page).toHaveURL(/\/fill$/);

  await field(page, 'Reported fault description').locator('textarea').fill('Panel in fault');
  await field(page, 'Time on site').locator('input').fill('09:00');
  await field(page, 'Time off site').locator('input').fill('10:30');
  await field(page, 'Findings on arrival').locator('textarea').fill('Detector head dirty');
  await field(page, 'Work carried out').locator('textarea').fill('Cleaned detector, reset panel');
  await field(page, 'Recommended actions').locator('textarea').fill('Replace sounder\nFix cable');
  await field(page, 'System left in').locator('select').selectOption({ index: 1 });

  // A photo is saved on the device straight away (nothing is uploaded before submit)
  await field(page, 'Photos').locator('input[type=file]').setInputFiles({ name: 'panel.png', mimeType: 'image/png', buffer: PNG });
  await expect(field(page, 'Photos').getByAltText('Photos')).toBeVisible();
  expect(uploads).toHaveLength(0);

  const sig = field(page, 'Engineer signature');
  await sig.locator('canvas').scrollIntoViewIfNeeded();
  const box = (await sig.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 60, { steps: 8 });
  await page.mouse.move(box.x + 200, box.y + 40, { steps: 8 });
  await page.mouse.up();
  await sig.getByRole('button', { name: 'Save signature' }).click();
  await expect(sig.getByAltText('Signature')).toBeVisible();

  // Double-tap submit
  const submit = page.getByRole('button', { name: /Submit Jobsheet|Submitting/ });
  await submit.dblclick();
  await expect(page).toHaveURL(new RegExp(`/jobs/${JOB_ID}/submitted$`));

  // Everything reaches the "server", exactly once
  await expect.poll(rpcs).toEqual(['travelling', 'on_site', 'awaiting_review']);
  await expect.poll(() => db.remedials.length).toBe(2);
  expect(writes.filter(w => w.table === 'remedials')).toHaveLength(2);
  expect(writes.filter(w => w.table === 'remedials').every(w => w.prefer.includes('ignore-duplicates'))).toBe(true);
  expect(db.jobsheets).toHaveLength(1);
  expect(db.jobsheets[0]).toMatchObject({ id: jobsheetId });
  expect(db.jobsheets[0].submitted_at).toBeTruthy();
  expect(writes.some(w => w.table === 'audit_log')).toBe(false);

  // The signature and photo go to the photos bucket under the jobsheet; the jobsheet stores paths
  const base = `${COMPANY_ID}/${jobsheetId}`;
  await expect.poll(() => uploads.length).toBe(3);
  expect(uploads.map(u => `${u.bucket}:${u.path}`)).toEqual(expect.arrayContaining([
    `photos:${base}/signatures/engineer.png`,
    expect.stringMatching(new RegExp(`^photos:${base}/[0-9a-f-]{36}[.]jpg$`)),
    `pdfs:${base}/report.pdf`,
  ]));
  expect(uploads.find(u => u.path.endsWith('engineer.png'))!.body).toContain('image/png');
  expect(uploads.find(u => u.path.endsWith('.jpg'))!.body).toContain('image/jpeg'); // re-encoded
  expect(db.jobsheets[0]).toMatchObject({ engineer_signature_url: `${base}/signatures/engineer.png`, customer_signature_url: null });
  expect(JSON.stringify(db.jobsheets[0].answers)).not.toContain('data:image');
  expect(db.photos).toHaveLength(1);
  expect(db.photos[0]).toMatchObject({ jobsheet_id: jobsheetId, caption: 'Photos' });

  // The PDF is made after everything above, uploaded to the private bucket, and stored as a path
  const pdf = uploads.find(u => u.bucket === 'pdfs')!;
  // Chromium doesn't expose Blob parts of multipart bodies, so only the part headers are visible
  // here; tests/unit/pdf.test.ts checks the rendered bytes.
  expect(pdf.body).toContain('application/pdf');
  expect(uploads.indexOf(pdf)).toBe(uploads.length - 1);
  await expect.poll(() => db.jobsheets[0].pdf_path).toBe(`${base}/report.pdf`);
  await expect(page.getByRole('heading', { name: 'Job Submitted' })).toBeVisible();

  // Opening the form again goes back to the submitted screen
  await page.goto(`/jobs/${JOB_ID}/fill`);
  await expect(page).toHaveURL(new RegExp(`/jobs/${JOB_ID}/submitted$`));
  expect(writes.filter(w => w.table === 'remedials')).toHaveLength(2);
});
