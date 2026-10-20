import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ENGINEER_TRANSITIONS, canEngineerMove, engineerActions, applyStatus } from '../../src/lib/jobStatus';
import { localISODate, addDaysISO } from '../../src/lib/dates';
import { jobsheetIdFor, remedialIdFor } from '../../src/lib/ids';
import { detectRemedials } from '../../src/form-engine/remedialDetector';
import { validateAnswers, isAnswered, instanceErrorKey } from '../../src/form-engine/validation';
import type { Job, JobStatus, AnswersMap } from '../../src/types';
import type { TemplateDef, FieldDef } from '../../src/templates/types';

// ─── Status transitions ──────────────────────────────────────────────────────

describe('engineer status transitions', () => {
  // Must match set_job_status() in supabase/migrations/00010_security.sql
  const SERVER_ALLOWED: [JobStatus, JobStatus][] = [
    ['scheduled', 'travelling'], ['scheduled', 'on_site'],
    ['travelling', 'on_site'],
    ['on_site', 'completed'], ['on_site', 'awaiting_review'],
    ['completed', 'awaiting_review'],
  ];

  it('never offers a move the server would reject', () => {
    for (const [from, tos] of Object.entries(ENGINEER_TRANSITIONS) as [JobStatus, JobStatus[]][]) {
      for (const to of tos) {
        expect(SERVER_ALLOWED).toContainEqual([from, to]);
      }
    }
  });

  it('every in-progress status has a next step', () => {
    for (const status of ['scheduled', 'travelling', 'on_site', 'completed'] as JobStatus[]) {
      expect(engineerActions(status).length).toBeGreaterThan(0);
    }
  });

  it('every status button maps to an allowed move', () => {
    for (const status of Object.keys(ENGINEER_TRANSITIONS) as JobStatus[]) {
      for (const action of engineerActions(status)) {
        if (action.kind === 'status') expect(canEngineerMove(status, action.to)).toBe(true);
      }
    }
  });

  it('completion only happens through the jobsheet', () => {
    expect(engineerActions('on_site')).toEqual([{ kind: 'fill', label: 'Fill in jobsheet' }]);
    expect(canEngineerMove('on_site', 'completed')).toBe(false);
  });

  it('final and office-owned statuses offer nothing', () => {
    for (const status of ['unassigned', 'awaiting_review', 'reviewed', 'invoiced', 'cancelled'] as JobStatus[]) {
      expect(engineerActions(status)).toEqual([]);
    }
  });

  it('applyStatus sets each timestamp once, like the RPC', () => {
    const job = { id: 'j', status: 'scheduled', travelling_at: null, on_site_at: null, completed_at: null } as Job;
    const travelling = applyStatus(job, 'travelling', 'T1');
    expect(travelling).toMatchObject({ status: 'travelling', travelling_at: 'T1', on_site_at: null });
    const onSite = applyStatus(travelling, 'on_site', 'T2');
    expect(onSite).toMatchObject({ travelling_at: 'T1', on_site_at: 'T2' });
    const submitted = applyStatus(onSite, 'awaiting_review', 'T3');
    expect(submitted).toMatchObject({ status: 'awaiting_review', completed_at: 'T3' });
    expect(applyStatus(submitted, 'awaiting_review', 'T4').completed_at).toBe('T3');
  });
});

// ─── Dates ───────────────────────────────────────────────────────────────────

describe('localISODate (Europe/London)', () => {
  const originalTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Europe/London'; });
  afterAll(() => { process.env.TZ = originalTZ; });

  it('uses the local date just after midnight in BST, where toISOString is still yesterday', () => {
    const d = new Date('2026-10-20T00:30:00+01:00');
    expect(d.toISOString().slice(0, 10)).toBe('2026-10-19');
    expect(localISODate(d)).toBe('2026-10-20');
  });

  it('handles midnight in GMT', () => {
    expect(localISODate(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12-01');
    expect(localISODate(new Date('2026-11-30T23:59:59Z'))).toBe('2026-11-30');
  });

  it('steps across the BST → GMT change (25 Oct 2026) one day at a time', () => {
    expect(addDaysISO('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDaysISO('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDaysISO('2026-10-26', -1)).toBe('2026-10-25');
    expect(addDaysISO('2026-10-25', -1)).toBe('2026-10-24');
  });

  it('steps across the GMT → BST change and month/year ends', () => {
    expect(addDaysISO('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysISO('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('a week of next-day taps visits seven distinct dates', () => {
    let d = '2026-10-22';
    const seen = new Set<string>();
    for (let i = 0; i < 7; i++) { seen.add(d); d = addDaysISO(d, 1); }
    expect(seen.size).toBe(7);
    expect(d).toBe('2026-10-29');
  });
});

// ─── Deterministic ids ───────────────────────────────────────────────────────

describe('deterministic ids', () => {
  it('jobsheet id is stable per job and a valid uuid', () => {
    expect(jobsheetIdFor('job-1')).toBe(jobsheetIdFor('job-1'));
    expect(jobsheetIdFor('job-1')).not.toBe(jobsheetIdFor('job-2'));
    expect(jobsheetIdFor('job-1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('remedial ids differ by section, instance, field and line', () => {
    const ids = new Set([
      remedialIdFor('js', 's1', 0, 'f', 0),
      remedialIdFor('js', 's2', 0, 'f', 0),
      remedialIdFor('js', 's1', 1, 'f', 0),
      remedialIdFor('js', 's1', 0, 'g', 0),
      remedialIdFor('js', 's1', 0, 'f', 1),
    ]);
    expect(ids.size).toBe(5);
  });

  it('detectRemedials produces the same ids on a re-run', () => {
    const template: TemplateDef = {
      id: 't', name: 'T', system_type: null, job_type: 'reactive_callout', version: 1,
      sections: [
        { id: 'main', title: 'Main', fields: [
          { id: 'battery', label: 'Battery', type: 'pass_fail_note', triggers_remedial: true },
          { id: 'extra_free_text', label: 'Extra', type: 'longtext' },
        ] },
        { id: 'zones', title: 'Zones', repeatable: true, fields: [
          { id: 'detector', label: 'Detector', type: 'pass_fail_note', triggers_remedial: true },
        ] },
      ],
    };
    const answers: AnswersMap = {
      battery: { result: 'fail', note: 'flat' },
      extra_free_text: 'Replace sounder\nFix cable',
      zones_instances: [{ detector: { result: 'fail', note: 'a' } }, { detector: { result: 'fail', note: 'b' } }],
    };
    const first = detectRemedials(template, answers, 'js-1', 'site', 'co');
    const second = detectRemedials(template, answers, 'js-1', 'site', 'co');
    expect(first).toHaveLength(5);
    expect(new Set(first.map(r => r.id)).size).toBe(5);
    expect(second.map(r => r.id)).toEqual(first.map(r => r.id));
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe('validateAnswers', () => {
  const f = (type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef =>
    ({ id: type, label: type, type, required: true, ...extra });

  it('type-aware emptiness', () => {
    expect(isAnswered(f('pass_fail_note'), { result: null, note: '' })).toBe(false);
    expect(isAnswered(f('pass_fail_note'), { result: 'pass', note: '' })).toBe(true);
    expect(isAnswered(f('photo'), [])).toBe(false);
    expect(isAnswered(f('checklist'), { a: false })).toBe(false);
    expect(isAnswered(f('checklist'), { a: true })).toBe(true);
    expect(isAnswered(f('text'), '   ')).toBe(false);
    expect(isAnswered(f('number'), 0)).toBe(true);
    expect(isAnswered(f('signature'), { storage_path: '', captured_at: 'x' })).toBe(false);
  });

  const template: TemplateDef = {
    id: 't', name: 'T', system_type: null, job_type: 'reactive_callout', version: 1,
    sections: [
      { id: 'main', title: 'Main', fields: [
        f('text', { id: 'summary' }),
        f('pass_fail_note', { id: 'panel', required: false }),
      ] },
      { id: 'zones', title: 'Zones', repeatable: true, fields: [f('text', { id: 'zone_name' })] },
    ],
  };

  it('validates every repeat instance', () => {
    const errors = validateAnswers(template, {
      summary: 'ok',
      zones_instances: [{ zone_name: 'Z1' }, { zone_name: '' }],
    });
    expect(Object.keys(errors)).toEqual([instanceErrorKey('zones', 1, 'zone_name')]);
  });

  it('an untouched repeatable section still needs its first instance', () => {
    expect(validateAnswers(template, { summary: 'ok' })).toHaveProperty(instanceErrorKey('zones', 0, 'zone_name'));
  });

  it('a fail needs a note even on an optional field', () => {
    const base = { summary: 'ok', zones_instances: [{ zone_name: 'Z1' }] };
    expect(validateAnswers(template, { ...base, panel: { result: 'fail', note: ' ' } })).toEqual({
      panel: 'Add a note explaining the fail',
    });
    expect(validateAnswers(template, { ...base, panel: { result: 'fail', note: 'Fault light' } })).toEqual({});
  });
});
