// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { JobsheetPDF, type JobsheetPDFProps } from '../../src/pdf/JobsheetPDF';
import { answerDisplay, signatureState } from '../../src/pdf/PDFSections';
import type { FieldDef, TemplateDef } from '../../src/templates/types';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const pfn: FieldDef = { id: 'test', type: 'pass_fail_note', label: 'Zone test' };

describe('answerDisplay', () => {
  it('prints pass/fail notes as a result and note (repeat rows used to print [object Object])', () => {
    expect(answerDisplay(pfn, { result: 'fail', note: 'Detector dead' }))
      .toEqual({ kind: 'pass_fail', result: 'fail', note: 'Detector dead' });
    expect(answerDisplay(pfn, { result: null, note: '' })).toEqual({ kind: 'empty' });
  });

  it('labels yes/no/na, booleans and checklists', () => {
    expect(answerDisplay({ id: 'a', type: 'yes_no_na', label: '' }, 'n/a')).toEqual({ kind: 'text', text: 'N/A' });
    expect(answerDisplay({ id: 'b', type: 'text', label: '' }, true)).toEqual({ kind: 'text', text: 'Yes' });
    expect(answerDisplay({ id: 'c', type: 'checklist', label: '', items: ['One', 'Two'] }, { Two: true }))
      .toEqual({ kind: 'checklist', items: [['One', false], ['Two', true]] });
    expect(answerDisplay({ id: 'd', type: 'number', label: '' }, 0)).toEqual({ kind: 'text', text: '0' });
  });
});

describe('signatureState', () => {
  it('tells "not signed" apart from a signature whose image is missing', () => {
    expect(signatureState(null, {})).toBe('unsigned');
    expect(signatureState('co/js/signatures/engineer.png', {})).toBe('unavailable');
    expect(signatureState('co/js/signatures/engineer.png', { 'co/js/signatures/engineer.png': PNG })).toBe('signed');
  });
});

const template: TemplateDef = {
  id: 'fire_alarm_service',
  name: 'Fire Alarm Service',
  system_type: 'fire_alarm',
  job_type: 'ppm_service',
  version: 1,
  sections: [
    {
      id: 'zones', title: 'Zones', repeatable: true, repeat_label: 'Zone',
      fields: [
        { id: 'zone', type: 'text', label: 'Zone' },
        pfn,
      ],
    },
    {
      id: 'sign_off', title: 'Sign off',
      fields: [
        { id: 'photos', type: 'photo', label: 'Photos' },
        { id: 'engineer_signature', type: 'signature', label: 'Engineer' },
        { id: 'customer_name', type: 'text', label: 'Customer' },
      ],
    },
  ],
};

const SIG = 'co/js/signatures/engineer.png';
const props: JobsheetPDFProps = {
  template,
  jobsheet: {
    id: 'js', job_id: 'job', company_id: 'co', template_id: 'fire_alarm_service',
    answers: {
      zones_instances: [
        { zone: '1', test: { result: 'pass', note: '' } },
        { zone: '2', test: { result: 'fail', note: 'Detector dead' } },
      ],
      engineer_signature: { storage_path: SIG, captured_at: '2026-10-20T12:00:00Z' },
      customer_name: 'Pat Smith',
    },
    time_on_site: '2026-10-20T09:00:00Z', time_off_site: '2026-10-20T11:30:00Z',
    engineer_signature_url: SIG, customer_signature_url: null,
    submitted_at: '2026-10-20T11:30:00Z', pdf_path: null,
    created_at: '2026-10-20T09:00:00Z', updated_at: '2026-10-20T11:30:00Z',
  },
  job: {
    id: 'job', company_id: 'co', site_id: 'site', system_id: null, type: 'ppm_service',
    template_id: 'fire_alarm_service', assigned_engineer_id: 'eng', scheduled_date: '2026-10-20',
    status: 'awaiting_review', notes: null, client_no: null, call_no: null, reported_fault: null, scheduled_time: '09:00', duration_minutes: null, travelling_at: null,
    on_site_at: '2026-10-20T08:55:00Z', completed_at: '2026-10-20T11:30:00Z', created_at: '2026-10-01T00:00:00Z',
  },
  site: {
    id: 'site', company_id: 'co', customer_id: 'cust', name: 'High St Office', address: '1 High St', job_codes: [], contact_name: null, contact_phone: null,
    access_notes: null, arc_name: null, arc_account: null, police_urn: null, hazards: null, keyholders: [],
    client_no: null, created_at: '',
  },
  customer: {
    id: 'cust', company_id: 'co', name: 'Acme', contact_name: null, contact_email: null, contact_phone: null,
    billing_address: null, notes: null, created_at: '', updated_at: '',
  },
  company: { id: 'co', name: 'Test Fire Ltd', logo_url: null, address: null, accreditation_number: null, created_at: '' },
  engineerProfile: { id: 'eng', user_id: 'u', company_id: 'co', role: 'engineer', active: true, full_name: 'Sam Engineer', email: '', created_at: '' },
  photos: [
    { id: 'p1', jobsheet_id: 'js', company_id: 'co', storage_path: 'co/js/p1.jpg', caption: 'Panel', created_at: '' },
    { id: 'p2', jobsheet_id: 'js', company_id: 'co', storage_path: 'co/js/p2.jpg', caption: 'Missing', created_at: '' },
  ],
  remedials: [],
  images: { [SIG]: PNG, 'co/js/p1.jpg': PNG },
};

describe('JobsheetPDF', () => {
  it('renders with repeat-section pass/fail rows, a signature, photos and a missing photo', async () => {
    const element = createElement(JobsheetPDF, props) as unknown as ReactElement<DocumentProps>;
    const buf = await renderToBuffer(element);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    // The signature and p1 are embedded; p2 has no image and gets a placeholder
    expect(buf.toString('latin1').match(/\/Subtype \/Image/g)).toHaveLength(2);
  });

  it('renders with no engineer, no signatures and no photos', async () => {
    const element = createElement(JobsheetPDF, {
      ...props, engineerProfile: null, photos: [], images: {},
      jobsheet: { ...props.jobsheet, engineer_signature_url: null },
    }) as unknown as ReactElement<DocumentProps>;
    const buf = await renderToBuffer(element);
    expect(buf.toString('latin1')).not.toMatch(/\/Subtype \/Image/);
  });
});
