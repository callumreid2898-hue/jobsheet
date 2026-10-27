import { describe, it, expect } from 'vitest';
import { clashingIds, findClashes, jobInterval, movePatch, overdueUnassigned, toMinutes } from '../../src/lib/planner';
import { managerActions, statusAfterAssign } from '../../src/lib/jobStatus';
import { computeDashboardStats } from '../../src/hooks/useDashboardStats';
import { buildTimeline } from '../../src/lib/jobTimeline';
import type { AuditLog, Job, JobStatus, Profile, Remedial } from '../../src/types';

const job = (id: string, over: Partial<Job> = {}): Job => ({
  id, company_id: 'co', site_id: 's', system_id: null, type: 'ppm_service', template_id: 'fire_alarm_service',
  assigned_engineer_id: 'eng1', scheduled_date: '2026-10-26', scheduled_time: null, duration_minutes: null,
  status: 'scheduled', notes: null, client_no: null, call_no: null, reported_fault: null, travelling_at: null, on_site_at: null, completed_at: null,
  created_at: '2026-10-01T09:00:00Z', ...over,
});

describe('time maths', () => {
  it('parses HH:mm and uses a 60 minute default', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('9:30')).toBeNull();
    expect(jobInterval(job('a', { scheduled_time: '09:00' }))).toEqual([540, 600]);
    expect(jobInterval(job('a', { scheduled_time: '09:00', duration_minutes: 150 }))).toEqual([540, 690]);
    expect(jobInterval(job('a'))).toBeNull();
  });
});

describe('findClashes', () => {
  const a = job('a', { scheduled_time: '09:00', duration_minutes: 120 }); // 09:00–11:00
  it('finds overlaps for the same engineer and day', () => {
    const b = job('b', { scheduled_time: '10:30' });
    expect(findClashes(a, [a, b]).map(j => j.id)).toEqual(['b']);
    expect(clashingIds([a, b])).toEqual(new Set(['a', 'b']));
  });

  it('back-to-back jobs do not clash', () => {
    expect(findClashes(a, [a, job('b', { scheduled_time: '11:00' })])).toEqual([]);
  });

  it('ignores other engineers, other days, untimed, unassigned and cancelled jobs', () => {
    const others = [
      job('b', { scheduled_time: '10:00', assigned_engineer_id: 'eng2' }),
      job('c', { scheduled_time: '10:00', scheduled_date: '2026-10-27' }),
      job('d'),
      job('e', { scheduled_time: '10:00', status: 'cancelled' }),
    ];
    expect(findClashes(a, [a, ...others])).toEqual([]);
    expect(findClashes({ ...a, assigned_engineer_id: null }, [a, job('f', { scheduled_time: '10:00', assigned_engineer_id: null })])).toEqual([]);
  });
});

describe('movePatch', () => {
  it('assigning an unassigned job schedules it', () => {
    const j = job('a', { status: 'unassigned', assigned_engineer_id: null });
    expect(movePatch(j, { engineerId: 'eng1', date: '2026-10-27', time: '09:00' }))
      .toEqual({ assigned_engineer_id: 'eng1', scheduled_date: '2026-10-27', scheduled_time: '09:00', status: 'scheduled' });
  });

  it('dropping into Unassigned un-schedules it', () => {
    expect(movePatch(job('a'), { engineerId: null, date: null, time: null }))
      .toEqual({ assigned_engineer_id: null, status: 'unassigned' });
  });

  it('a drop that changes nothing is null; started and closed jobs are locked', () => {
    expect(movePatch(job('a'), { engineerId: 'eng1', date: '2026-10-26', time: null })).toBeNull();
    for (const status of ['travelling', 'on_site', 'awaiting_review', 'reviewed', 'invoiced', 'cancelled'] as JobStatus[]) {
      expect(movePatch(job('a', { status }), { engineerId: 'eng2', date: null, time: null })).toBeNull();
    }
  });

  it('repairs a job assigned earlier whose status stayed unassigned', () => {
    expect(movePatch(job('a', { status: 'unassigned' }), { engineerId: 'eng1', date: '2026-10-26', time: null }))
      .toEqual({ status: 'scheduled' });
  });
});

describe('job status helpers', () => {
  it('statusAfterAssign only touches unassigned/scheduled', () => {
    expect(statusAfterAssign('unassigned', 'e')).toBe('scheduled');
    expect(statusAfterAssign('scheduled', null)).toBe('unassigned');
    expect(statusAfterAssign('on_site', null)).toBe('on_site');
  });

  it('managerActions', () => {
    expect(managerActions('awaiting_review')).toEqual(['review', 'cancel']);
    expect(managerActions('reviewed')).toEqual(['invoice', 'cancel']);
    expect(managerActions('invoiced')).toEqual([]);
    expect(managerActions('cancelled')).toEqual([]);
  });

  it('overdueUnassigned', () => {
    const jobs = [
      job('old', { status: 'unassigned', assigned_engineer_id: null, scheduled_date: '2026-10-19' }),
      job('today', { status: 'unassigned', assigned_engineer_id: null, scheduled_date: '2026-10-20' }),
      job('assigned', { scheduled_date: '2026-10-19' }),
    ];
    expect(overdueUnassigned(jobs, '2026-10-20').map(j => j.id)).toEqual(['old']);
  });
});

describe('computeDashboardStats', () => {
  const remedial = (over: Partial<Remedial>): Remedial => ({
    id: 'r', jobsheet_id: 'js', site_id: 's', company_id: 'co', description: '', priority: 'urgent',
    status: 'open', created_at: '', updated_at: '', ...over,
  });

  it('leaves cancelled and closed jobs out of the job counts', () => {
    const stats = computeDashboardStats({
      today: '2026-10-26',
      jobs: [
        job('u', { status: 'unassigned', assigned_engineer_id: null }),
        job('x', { status: 'cancelled', assigned_engineer_id: null }),
        job('i', { status: 'invoiced', assigned_engineer_id: null }),
        job('t', { scheduled_date: '2026-10-26' }),
        job('xt', { scheduled_date: '2026-10-26', status: 'cancelled' }),
        job('r', { status: 'awaiting_review' }),
      ],
      remedials: [remedial({}), remedial({ id: 'r2', priority: 'advisory' }), remedial({ id: 'r3', status: 'done' })],
      contracts: [], invoices: [], sites: [],
    });
    expect(stats.unassignedJobs).toBe(1);
    expect(stats.scheduledToday).toBe(4); // u, i, t, r are dated today; the cancelled one isn't counted
    expect(stats.awaitingReview).toBe(1);
    expect(stats.jobsByStatus.map(s => s.status).sort()).toEqual(['awaiting_review', 'scheduled', 'unassigned']);
    expect([stats.openRemedials, stats.urgentRemedials]).toEqual([2, 1]);
  });

  it('days run from the local "today" across the clock change', () => {
    const stats = computeDashboardStats({
      today: '2026-10-26', jobs: [job('a', { scheduled_date: '2026-10-25' })],
      remedials: [], contracts: [], invoices: [], sites: [],
    });
    expect(stats.jobsLast30Days.at(-1)).toEqual({ date: '26 Oct', count: 0 });
    expect(stats.jobsLast30Days.at(-2)).toEqual({ date: '25 Oct', count: 1 });
  });
});

describe('buildTimeline', () => {
  const profiles = [{ id: 'p', user_id: 'u-mgr', full_name: 'Morgan Manager' } as Profile];
  const log = (action: string, at: string): AuditLog => ({
    id: action, company_id: 'co', user_id: 'u-mgr', action, entity_type: 'jobs', entity_id: 'a', created_at: at,
  });

  it('uses the audit log with names, and fills gaps from job timestamps, oldest first', () => {
    const j = job('a', { status: 'reviewed', travelling_at: '2026-10-26T08:00:00Z', on_site_at: '2026-10-26T08:30:00Z' });
    const events = buildTimeline(j, null, [
      log('job_status:reviewed', '2026-10-26T12:00:00Z'),
      log('job_status:on_site', '2026-10-26T08:31:00Z'),
    ], profiles);
    expect(events.map(e => [e.label, e.by])).toEqual([
      ['Job created', null],
      ['Status: Travelling', null],
      ['Status: On Site', 'Morgan Manager'],
      ['Status: Reviewed', 'Morgan Manager'],
    ]);
  });
});
