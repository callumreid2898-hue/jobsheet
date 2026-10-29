import { describe, it, expect } from 'vitest';
import {
  coverage, collectDeviceTests, deviceLabel, deviceQrUrl, parseDevicePayload,
} from '../../src/lib/devices';
import { deviceTestIdFor } from '../../src/lib/ids';
import { detectRemedials } from '../../src/form-engine/remedialDetector';
import { validateAnswers, isAnswered } from '../../src/form-engine/validation';
import { answerDisplay } from '../../src/pdf/PDFSections';
import type { TemplateDef, FieldDef } from '../../src/templates/types';
import type { Device, DeviceTest, DeviceTestAnswers } from '../../src/types';

const dev = (id: string, extra: Partial<Device> = {}): Device => ({
  id, site_id: 's1', company_id: 'c1', system_id: null, status: 'active', type: 'smoke_detector',
  location: `Room ${id}`, make: null, model: null, serial_number: null, install_date: null,
  qr_code: `qr-${id}`, notes: null, created_at: '2026-01-01T00:00:00Z', ...extra,
});

const test = (device_id: string, tested_at: string, result: DeviceTest['result'] = 'pass'): DeviceTest => ({
  id: `${device_id}-${tested_at}`, device_id, jobsheet_id: null, company_id: 'c1', result, note: null, tested_at,
});

const field: FieldDef = {
  id: 'device_tests', type: 'device_tests', label: 'Registered devices', triggers_remedial: true, remedial_priority: 'urgent',
};
const template: TemplateDef = {
  id: 'fire_alarm_service', name: 'FA', system_type: 'fire_alarm', job_type: 'ppm_service', version: 2,
  sections: [{ id: 'device_register', title: 'Device Tests', fields: [field] }],
};

describe('parseDevicePayload', () => {
  it('reads the code from a label link', () => {
    expect(parseDevicePayload('https://guardian-fsm.vercel.app/d/abc-123')).toBe('abc-123');
    expect(parseDevicePayload('https://guardian-fsm.vercel.app/d/abc-123/')).toBe('abc-123');
    expect(parseDevicePayload(' http://localhost:5173/d/a%20b ')).toBe('a b');
  });

  it('accepts the bare code on older labels', () => {
    expect(parseDevicePayload('5f0c2a9e-1d3b-4c55-9a77-0e6b8f1d2c3a')).toBe('5f0c2a9e-1d3b-4c55-9a77-0e6b8f1d2c3a');
  });

  it('rejects anything else', () => {
    expect(parseDevicePayload('')).toBeNull();
    expect(parseDevicePayload('https://example.com/menu')).toBeNull();
    expect(parseDevicePayload('https://example.com/d/x/y')).toBeNull();
    expect(parseDevicePayload('WIFI:S:guest;T:WPA;P:secret;;')).toBeNull();
    expect(parseDevicePayload('hello world')).toBeNull();
  });

  it('round-trips the link a label prints', () => {
    expect(parseDevicePayload(deviceQrUrl('abc/def', 'https://app.test'))).toBe('abc/def');
  });
});

describe('coverage', () => {
  const today = '2026-10-29';

  it('has no percentage with no devices', () => {
    expect(coverage([], [], today)).toMatchObject({ total: 0, tested: 0, percent: null, untested: [] });
  });

  it('counts devices with no tests as untested', () => {
    const c = coverage([dev('a'), dev('b')], [], today);
    expect(c).toMatchObject({ total: 2, tested: 0, percent: 0 });
    expect(c.untested.map(d => d.id)).toEqual(['a', 'b']);
  });

  it('counts a pass or fail in the last 12 months, not a "not tested" or an older test', () => {
    const c = coverage(
      [dev('a'), dev('b'), dev('c'), dev('d')],
      [
        test('a', '2026-03-01T10:00:00Z'),
        test('b', '2026-03-01T10:00:00Z', 'not_tested'),
        test('c', '2025-10-28T12:00:00Z'),   // a year and a day ago
        test('d', '2025-10-29T12:00:00Z'),   // exactly a year ago: still counts
      ],
      today,
    );
    expect(c.tested).toBe(2);
    expect(c.untested.map(d => d.id)).toEqual(['b', 'c']);
  });

  it('ignores removed devices and rounds down', () => {
    const c = coverage(
      [dev('a'), dev('b'), dev('c'), dev('gone', { status: 'removed' })],
      [test('a', '2026-10-01T09:00:00Z'), test('b', '2026-10-01T09:00:00Z')],
      today,
    );
    expect(c).toMatchObject({ total: 3, tested: 2, percent: 66 });
  });

  it('counts a device as failing when its latest test failed', () => {
    const c = coverage(
      [dev('a'), dev('b')],
      [
        test('a', '2026-05-01T09:00:00Z', 'fail'), test('a', '2026-09-01T09:00:00Z', 'pass'),
        test('b', '2026-05-01T09:00:00Z', 'pass'), test('b', '2026-09-01T09:00:00Z', 'fail'),
      ],
      today,
    );
    expect(c).toMatchObject({ tested: 2, failing: 1, percent: 100 });
  });
});

describe('device tests on a service sheet', () => {
  const answers = {
    device_tests: {
      d1: { result: 'pass', note: '', label: 'Smoke Detector — Room 1' },
      d2: { result: 'fail', note: '  No response to smoke  ', label: 'Smoke Detector — Room 2' },
      d3: { result: null, note: '', label: 'Call Point — Exit' },
    } satisfies DeviceTestAnswers,
  };

  it('collects one test per device with a result, with ids per jobsheet and device', () => {
    const tests = collectDeviceTests(template, answers, 'js1', 'c1', '2026-10-29T10:00:00.000Z');
    expect(tests).toEqual([
      { id: deviceTestIdFor('js1', 'd1'), device_id: 'd1', jobsheet_id: 'js1', company_id: 'c1', result: 'pass', note: null, tested_at: '2026-10-29T10:00:00.000Z' },
      { id: deviceTestIdFor('js1', 'd2'), device_id: 'd2', jobsheet_id: 'js1', company_id: 'c1', result: 'fail', note: 'No response to smoke', tested_at: '2026-10-29T10:00:00.000Z' },
    ]);
    expect(deviceTestIdFor('js1', 'd1')).not.toBe(deviceTestIdFor('js2', 'd1'));
  });

  it('raises one remedial per failed device, the same id every run', () => {
    const run = () => detectRemedials(template, answers, 'js1', 's1', 'c1');
    expect(run()).toEqual([expect.objectContaining({
      description: 'Smoke Detector — Room 2: No response to smoke', priority: 'urgent', site_id: 's1',
    })]);
    expect(run()[0].id).toBe(run()[0].id);
  });

  it('needs a note for each failed device', () => {
    const noNote = { device_tests: { d2: { result: 'fail', note: ' ', label: 'Smoke Detector — Room 2' } } satisfies DeviceTestAnswers };
    expect(validateAnswers(template, noNote).device_tests).toMatch(/Room 2/);
    expect(validateAnswers(template, answers)).toEqual({});
  });

  it('counts as answered once any device has a result', () => {
    expect(isAnswered(field, { d3: { result: null, note: '', label: 'x' } })).toBe(false);
    expect(isAnswered(field, answers.device_tests)).toBe(true);
  });

  it('prints the devices with a result', () => {
    expect(answerDisplay(field, answers.device_tests)).toEqual({
      kind: 'devices',
      rows: [
        { label: 'Smoke Detector — Room 1', result: 'pass', note: '' },
        { label: 'Smoke Detector — Room 2', result: 'fail', note: 'No response to smoke' },
      ],
    });
    expect(answerDisplay(field, { d3: { result: null, note: '', label: 'x' } })).toEqual({ kind: 'empty' });
  });
});

it('labels a device by type and location', () => {
  expect(deviceLabel({ type: 'call_point', location: 'Main exit' })).toBe('Call Point — Main exit');
  expect(deviceLabel({ type: 'heat_detector', location: null })).toBe('Heat Detector');
});
