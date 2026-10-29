import { addDaysISO, localISODate } from './dates';
import { deviceTestIdFor } from './ids';
import type { TemplateDef, FieldDef } from '../templates/types';
import type { AnswersMap, Device, DeviceTest, DeviceTestAnswers, DeviceTestResult } from '../types';

/** Suggested device types (stored snake_case; anything else can be typed). */
export const DEVICE_TYPES = [
  'smoke_detector', 'heat_detector', 'multi_sensor', 'call_point', 'beam_detector', 'aspirating',
  'sounder', 'vad', 'interface', 'panel', 'emergency_light', 'camera', 'recorder', 'other',
];

export const DEVICE_TEST_LABELS: Record<DeviceTestResult, string> = {
  pass: 'Pass', fail: 'Fail', not_tested: 'Not tested',
};

/** "smoke_detector" → "Smoke Detector" */
export function formatDeviceType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** e.g. "Smoke Detector — Zone 1 Reception" */
export function deviceLabel(device: Pick<Device, 'type' | 'location'>): string {
  return formatDeviceType(device.type) + (device.location ? ` — ${device.location}` : '');
}

/** What a device label's QR code holds: a link to the app, so a phone's camera app opens the device. */
export function deviceQrUrl(qrCode: string, origin: string): string {
  return `${origin}/d/${encodeURIComponent(qrCode)}`;
}

/**
 * The qr_code in a scanned label: the code from a `/d/<code>` link, or the bare code
 * printed on older labels. Null for anything else (another site's URL, blank).
 */
export function parseDevicePayload(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      const m = new URL(t).pathname.match(/^\/d\/([^/]+)\/?$/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  }
  return /^[\w-]+$/.test(t) ? t : null;
}

export interface Coverage {
  /** Active devices */
  total: number;
  /** Active devices with a pass or fail in the last 12 months */
  tested: number;
  /** Of those, the ones whose latest result is a fail */
  failing: number;
  /** tested / total, rounded down (so one untested device never shows 100%); null with no devices */
  percent: number | null;
  untested: Device[];
}

/**
 * Test coverage over the last 12 months (BS 5839-1: every device tested within a year).
 * Removed devices don't count; "not tested" results don't count as a test.
 */
export function coverage(devices: Device[], tests: DeviceTest[], today = localISODate()): Coverage {
  const since = addDaysISO(today, -365);
  const latest = new Map<string, DeviceTest>();
  for (const t of tests) {
    if (t.result === 'not_tested' || localISODate(new Date(t.tested_at)) < since) continue;
    const prev = latest.get(t.device_id);
    if (!prev || t.tested_at > prev.tested_at) latest.set(t.device_id, t);
  }
  const active = devices.filter(d => d.status !== 'removed');
  const tested = active.filter(d => latest.has(d.id));
  return {
    total: active.length,
    tested: tested.length,
    failing: tested.filter(d => latest.get(d.id)!.result === 'fail').length,
    percent: active.length ? Math.floor((tested.length / active.length) * 100) : null,
    untested: active.filter(d => !latest.has(d.id)),
  };
}

/** Every `device_tests` answer in the jobsheet (repeatable sections too), with the field it came from. */
export function deviceTestAnswers(template: TemplateDef, answers: AnswersMap): { field: FieldDef; value: DeviceTestAnswers }[] {
  const out: { field: FieldDef; value: DeviceTestAnswers }[] = [];
  for (const section of template.sections) {
    const fields = section.fields.filter(f => f.type === 'device_tests');
    if (fields.length === 0) continue;
    const instances = section.repeatable ? ((answers[section.id + '_instances'] as AnswersMap[] | undefined) ?? []) : [answers];
    for (const inst of instances) {
      for (const field of fields) {
        const value = inst[field.id] as DeviceTestAnswers | null | undefined;
        if (value) out.push({ field, value });
      }
    }
  }
  return out;
}

/** The device_tests rows a submitted jobsheet creates: one per device with a result (ids are deterministic). */
export function collectDeviceTests(
  template: TemplateDef, answers: AnswersMap, jobsheetId: string, companyId: string, testedAt: string,
): DeviceTest[] {
  const byDevice = new Map<string, DeviceTest>();
  for (const { value } of deviceTestAnswers(template, answers)) {
    for (const [deviceId, entry] of Object.entries(value)) {
      if (!entry?.result) continue;
      byDevice.set(deviceId, {
        id: deviceTestIdFor(jobsheetId, deviceId),
        device_id: deviceId,
        jobsheet_id: jobsheetId,
        company_id: companyId,
        result: entry.result,
        note: entry.note?.trim() || null,
        tested_at: testedAt,
      });
    }
  }
  return [...byDevice.values()];
}
