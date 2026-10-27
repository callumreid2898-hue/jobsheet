import { describe, it, expect } from 'vitest';
import { prefillAnswers, fillSubmitAnswers, formatDuration, type PrefillContext } from '../../src/lib/jobsheetPrefill';
import corrective from '../../src/templates/corrective_maintenance.json';
import reactive from '../../src/templates/reactive_callout.json';
import inspection from '../../src/templates/fire_alarm_inspection.json';
import type { TemplateDef } from '../../src/templates/types';
import type { Job, Site, Customer, System } from '../../src/types';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'job', company_id: 'co', site_id: 'site', system_id: 'sys', type: 'reactive_callout',
  template_id: 'corrective_maintenance', assigned_engineer_id: 'eng', scheduled_date: '2026-10-27',
  status: 'on_site', notes: null, client_no: null, call_no: '4471', reported_fault: 'Zone 3 fault on panel',
  scheduled_time: null, duration_minutes: null,
  travelling_at: '2026-10-27T08:20:00Z', on_site_at: '2026-10-27T09:05:00Z', completed_at: null,
  created_at: '2026-10-26T12:00:00Z', ...over,
});
const site = {
  id: 'site', company_id: 'co', customer_id: 'cust', name: 'High St Office', address: '1 High St, Hamilton', job_codes: [] as string[], client_no: 'C-88',
} as Site;
const customer = { id: 'cust', name: 'Acme Ltd' } as Customer;
const system = { id: 'sys', make: 'Advanced', model: 'MxPro 5', zones_count: 8, loops_count: 2 } as System;
const ctx = (over: Partial<PrefillContext> = {}): PrefillContext =>
  ({ job: job(), site, customer, system, engineerName: 'Callum Reid', ...over });

describe('prefillAnswers', () => {
  it('fills the corrective maintenance header from the job, leaving the engineer\'s boxes blank', () => {
    const a = prefillAnswers(corrective as TemplateDef, ctx());
    expect(a).toMatchObject({
      site_name_address: 'High St Office, 1 High St, Hamilton',
      date: '27/10/2026',
      call_no: '4471',
      client_no: 'C-88',              // from the site, as the job has none
      job_type_radio: 'Call out',
      reported_fault: 'Zone 3 fault on panel',
      engineer_name: 'Callum Reid',
      sign_date: '27/10/2026',
      time_arrival: '09:05',           // UK time (GMT on this date)
      travel_time: '45m',
    });
    expect(a.action_taken).toBeUndefined();
    expect(a.further_action_required).toBeUndefined();
    // departure and time taken wait for submit
    expect(a.time_depart).toBeUndefined();
    expect(a.time_on_site).toBeUndefined();
  });

  it('prefers the job\'s client no. and leaves out what the job lacks', () => {
    const a = prefillAnswers(corrective as TemplateDef, ctx({
      job: job({ client_no: 'J-1', reported_fault: null, call_no: null, travelling_at: null, on_site_at: null, type: 'install' }),
    }));
    expect(a.client_no).toBe('J-1');
    expect(a).not.toHaveProperty('reported_fault');
    expect(a).not.toHaveProperty('call_no');
    expect(a).not.toHaveProperty('time_arrival');
    expect(a).not.toHaveProperty('travel_time');
    expect(a).not.toHaveProperty('job_type_radio'); // install isn't on the sheet
  });

  it('fills panel details on the inspection certificate from the system', () => {
    const a = prefillAnswers(inspection as TemplateDef, ctx());
    expect(a).toMatchObject({ panel_make_model: 'Advanced MxPro 5', zones: 8, loops_circuits: 2 });
  });
});

describe('fillSubmitAnswers', () => {
  const now = new Date('2026-10-27T11:20:00Z');

  it('stamps departure and works out time taken from the times on the sheet', () => {
    const a = fillSubmitAnswers(corrective as TemplateDef, { time_arrival: '09:05' }, job(), now);
    expect(a.time_depart).toBe('11:20');
    expect(a.time_on_site).toBe('2h 15m');
  });

  it('never overwrites what the engineer entered', () => {
    const a = fillSubmitAnswers(corrective as TemplateDef,
      { time_arrival: '09:30', time_depart: '10:00', time_on_site: 'half an hour', travel_time: '1h' }, job(), now);
    expect(a).toMatchObject({ time_arrival: '09:30', time_depart: '10:00', time_on_site: 'half an hour', travel_time: '1h' });
  });

  it('uses the edited arrival time and fills arrival if the sheet was opened before On site', () => {
    expect(fillSubmitAnswers(corrective as TemplateDef, { time_arrival: '10:20' }, job(), now).time_on_site).toBe('1h 00m');
    const a = fillSubmitAnswers(corrective as TemplateDef, {}, job(), now);
    expect(a.time_arrival).toBe('09:05');
    expect(a.travel_time).toBe('45m');
  });

  it('fills the reactive callout\'s required off-site time', () => {
    expect(fillSubmitAnswers(reactive as TemplateDef, {}, job(), now).time_off_site).toBe('11:20');
  });
});

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(59)).toBe('59m');
    expect(formatDuration(65)).toBe('1h 05m');
  });
});
