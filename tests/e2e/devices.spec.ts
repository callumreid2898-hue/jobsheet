import { test, expect, type Page } from '@playwright/test';
import { fakeSupabase, signIn, today, type Row } from './fakeSupabase';

/** Device register, service-sheet device tests, QR links, site edits and safety info (audit Batch 11). */

const USER = '00000000-0000-4000-8000-0000000000e1';
const ENG = '00000000-0000-4000-8000-0000000000a1';
const MGR = '00000000-0000-4000-8000-0000000000a2';
const CO = '00000000-0000-4000-8000-0000000000c1';
const CUST = '00000000-0000-4000-8000-0000000000d1';
const SITE = '00000000-0000-4000-8000-0000000000b1';
const SYS = '00000000-0000-4000-8000-0000000000f2';
const SYS_CCTV = '00000000-0000-4000-8000-0000000000f3';
const JOB = '00000000-0000-4000-8000-0000000000f1';
const dev = (n: number) => `00000000-0000-4000-8000-00000000090${n}`;

test.use({ serviceWorkers: 'block', timezoneId: 'Europe/London' });

function fixtures(role: 'engineer' | 'manager'): Record<string, Row[]> {
  const device = (n: number, extra: Row) => ({
    id: dev(n), site_id: SITE, company_id: CO, system_id: SYS, status: 'active', type: 'smoke_detector',
    make: null, model: null, serial_number: null, install_date: null, qr_code: `qr-${n}`, notes: null,
    created_at: '2026-01-01T00:00:00Z', ...extra,
  });
  return {
    profiles: [{ id: role === 'engineer' ? ENG : MGR, user_id: USER, company_id: CO, role, full_name: 'Sam Smith', email: 's@test.local', active: true }],
    companies: [{ id: CO, name: 'Test Fire Ltd' }],
    customers: [{ id: CUST, company_id: CO, name: 'Acme Offices' }],
    sites: [{
      id: SITE, company_id: CO, customer_id: CUST, name: '1 Test Street', address: '1 Test Street', job_codes: [],
      hazards: 'Asbestos above plant room ceiling', arc_name: 'Southern Monitoring', arc_account: 'A-123', police_urn: null,
      keyholders: [{ name: 'Second Contact', phone: '0700 000002', order: 2 }, { name: 'First Contact', phone: '0700 000001', order: 1 }],
    }],
    systems: [
      { id: SYS, site_id: SITE, company_id: CO, type: 'fire_alarm', make: 'Advanced', model: 'MxPro 5' },
      { id: SYS_CCTV, site_id: SITE, company_id: CO, type: 'cctv', make: 'Hik', model: null },
    ],
    devices: [
      device(1, { location: 'Reception' }),
      device(2, { location: 'Kitchen', type: 'heat_detector', system_id: null }),
      device(3, { location: 'Car park', type: 'camera', system_id: SYS_CCTV }),
      device(4, { location: 'Old store', status: 'removed' }),
    ],
    device_tests: [
      { id: '00000000-0000-4000-8000-000000000a01', device_id: dev(1), jobsheet_id: null, company_id: CO, result: 'pass', note: null, tested_at: '2026-06-01T10:00:00Z' },
    ],
    jobs: [{
      id: JOB, company_id: CO, site_id: SITE, system_id: SYS, type: 'ppm_service', template_id: 'fire_alarm_service',
      assigned_engineer_id: ENG, scheduled_date: today, scheduled_time: null, status: 'on_site', notes: null,
      travelling_at: null, on_site_at: new Date().toISOString(), completed_at: null, created_at: new Date().toISOString(),
    }],
    jobsheets: [], remedials: [], photos: [], contracts: [], invites: [],
  };
}

const field = (page: Page, label: string) =>
  page.locator('div.px-4.py-3').filter({ has: page.locator('label', { hasText: label }) }).first();

async function sign(page: Page, label: string) {
  const sig = field(page, label);
  await sig.locator('canvas').scrollIntoViewIfNeeded();
  const box = (await sig.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await sig.getByRole('button', { name: 'Save signature' }).click();
  await expect(sig.getByAltText('Signature')).toBeVisible();
}

test('engineer: device tests on the service sheet are saved per device, and a fail raises a remedial', async ({ page }) => {
  const { db, writes } = await fakeSupabase(page, fixtures('engineer'));
  await signIn(page, USER, 's@test.local');

  // Safety info is on the job page
  await page.goto(`/jobs/${JOB}`);
  await expect(page.getByRole('alert')).toContainText('Asbestos above plant room ceiling');
  await expect(page.getByTestId('keyholders')).toContainText(/1\. First Contact.*0700 000001.*2\. Second Contact/s);
  await expect(page.getByText('ARC: Southern Monitoring, account A-123')).toBeVisible();

  await page.goto(`/jobs/${JOB}/fill`);
  const devices = page.getByTestId('device-tests-device_tests');
  // The fire alarm's devices and unlinked ones; not the CCTV camera or the removed detector
  await expect(devices.getByTestId('device-test-row')).toHaveCount(2);
  await expect(devices).toContainText('Smoke Detector — Reception');
  await expect(devices).toContainText('Heat Detector — Kitchen');
  await expect(devices).not.toContainText('Car park');
  await expect(devices).not.toContainText('Old store');

  await devices.getByRole('group', { name: 'Heat Detector — Kitchen' }).getByRole('button', { name: 'Fail' }).click();
  await devices.getByRole('button', { name: 'Pass all not yet recorded (1)' }).click();
  await expect(devices.getByText('2 of 2 recorded')).toBeVisible();

  for (const label of ['Fault LEDs / display clear', 'Mains power present', 'Battery condition', 'Date / time correct']) {
    await field(page, label).getByRole('button', { name: 'pass', exact: true }).click();
  }
  await field(page, 'Zone number / name').locator('input').fill('Zone 1');
  await field(page, 'Number of devices tested').locator('input').fill('2');
  await field(page, 'Cause and effect verified').getByRole('button', { name: 'Yes', exact: true }).click();
  await field(page, 'Log book updated').getByRole('button', { name: 'Yes', exact: true }).click();
  await sign(page, 'Engineer signature');

  // A failed device needs a note
  await page.getByRole('button', { name: 'Submit Jobsheet' }).click();
  await expect(devices.getByText(/Add a note for each failed device \(Heat Detector — Kitchen\)/)).toBeVisible();
  await devices.getByLabel('Note for Heat Detector — Kitchen').fill('No response to heat');
  await page.getByRole('button', { name: 'Submit Jobsheet' }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${JOB}/submitted$`));

  const jobsheetId = db.jobsheets[0].id;
  await expect.poll(() => writes.filter(w => w.table === 'device_tests').length).toBe(2);
  const sent = writes.filter(w => w.table === 'device_tests');
  expect(sent.every(w => w.prefer.includes('ignore-duplicates'))).toBe(true);
  expect(sent.map(w => w.body)).toEqual(expect.arrayContaining([
    expect.objectContaining({ device_id: dev(1), jobsheet_id: jobsheetId, result: 'pass', note: null }),
    expect.objectContaining({ device_id: dev(2), jobsheet_id: jobsheetId, result: 'fail', note: 'No response to heat' }),
  ]));
  await expect.poll(() => db.remedials.map(r => r.description)).toEqual(['Heat Detector — Kitchen: No response to heat']);
  expect(db.remedials[0]).toMatchObject({ priority: 'urgent', jobsheet_id: jobsheetId });
  // The report (which prints the device results) is still made
  await expect.poll(() => db.jobsheets[0].pdf_path).toBeTruthy();
});

test('engineer: a QR label link opens the device, and a manual test is recorded', async ({ page }) => {
  const { writes } = await fakeSupabase(page, fixtures('engineer'));
  await signIn(page, USER, 's@test.local');

  await page.goto('/d/qr-1');
  await expect(page).toHaveURL(new RegExp(`/devices/${dev(1)}$`));
  await expect(page.getByRole('heading', { name: 'Smoke Detector' })).toBeVisible();
  await expect(page.getByText('Fire Alarm · Advanced')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0); // managers only

  await page.getByRole('button', { name: 'Record test' }).click();
  await page.getByLabel('Result').selectOption('fail');
  await page.getByLabel(/Note/).fill('Head missing');
  await page.getByRole('button', { name: 'Save test' }).click();
  await expect.poll(() => writes.filter(w => w.table === 'device_tests').map(w => w.body))
    .toEqual([expect.objectContaining({ device_id: dev(1), jobsheet_id: null, result: 'fail', note: 'Head missing' })]);

  await page.goto('/d/not-a-label');
  await expect(page.getByText("This label isn't registered to a device in your company.")).toBeVisible();
});

test('manager: site devices tab shows coverage; add a device on a system; edit safety info', async ({ page }) => {
  const { db, writes } = await fakeSupabase(page, fixtures('manager'));
  await signIn(page, USER, 's@test.local');
  await page.setViewportSize({ width: 1280, height: 900 });

  // Old device URLs still work
  await page.goto(`/manager/sites/${SITE}/devices`);
  await expect(page).toHaveURL(new RegExp(`/manager/sites/${SITE}\\?tab=devices$`));
  // 1 of the 3 active devices tested this year
  await expect(page.getByTestId('coverage')).toContainText('33%');
  await expect(page.getByTestId('coverage')).toContainText('1 of 3 devices');
  await expect(page.getByTestId('device-list').locator('li')).toHaveCount(4);

  await page.getByRole('button', { name: '+ Add device' }).click();
  await page.getByLabel('Type').fill('call point');
  await page.getByLabel('System').selectOption({ label: 'Fire Alarm · Advanced · MxPro 5' });
  await page.getByLabel('Location').fill('Main exit');
  await page.getByRole('button', { name: 'Add device' }).click();
  await expect(page).toHaveURL(/\/devices\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Call Point' })).toBeVisible();
  expect(db.devices.find(d => d.location === 'Main exit')).toMatchObject({ type: 'call_point', system_id: SYS, status: 'active', site_id: SITE });

  // The QR label holds a link to the app
  await page.getByRole('button', { name: 'QR label' }).click();
  await expect(page.getByTestId('qr-label')).toContainText('Call Point — Main exit');

  // Edit the site's safety info
  await page.goto(`/manager/sites/${SITE}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Hazards').fill('Asbestos above plant room ceiling. Lone working not permitted.');
  await page.getByLabel('Police URN').fill('URN-77');
  await page.getByRole('button', { name: 'Move keyholder 2 up' }).click(); // the list shows calling order; swap them
  await page.getByRole('button', { name: '+ Add keyholder' }).click();
  await page.getByLabel('Keyholder 3 name').fill('Third Contact');
  await page.getByLabel('Keyholder 3 phone').fill('0700 000003');
  await page.getByRole('button', { name: 'Save site' }).click();
  await expect(page).toHaveURL(new RegExp(`/manager/sites/${SITE}$`));

  const patch = writes.find(w => w.method === 'PATCH' && w.table === 'sites')!.body as Row;
  expect(patch).toMatchObject({
    hazards: 'Asbestos above plant room ceiling. Lone working not permitted.',
    police_urn: 'URN-77',
    keyholders: [
      { name: 'Second Contact', phone: '0700 000002', order: 1 },
      { name: 'First Contact', phone: '0700 000001', order: 2 },
      { name: 'Third Contact', phone: '0700 000003', order: 3 },
    ],
  });
  await expect(page.getByText('URN-77')).toBeVisible();
});
