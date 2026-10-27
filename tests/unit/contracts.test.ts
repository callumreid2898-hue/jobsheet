import { describe, it, expect } from 'vitest';
import { addMonthsISO, advanceDue, contractDueState, daysBetween, dueLabel } from '../../src/lib/contracts';
import type { VisitFrequency } from '../../src/types';

describe('addMonthsISO', () => {
  it('clamps to the end of shorter months', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2028-01-31', 1)).toBe('2028-02-29'); // leap year
    expect(addMonthsISO('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonthsISO('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('rolls the year', () => {
    expect(addMonthsISO('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsISO('2026-12-01', 1)).toBe('2027-01-01');
  });
});

describe('advanceDue', () => {
  it('moves on by each frequency', () => {
    const cases: [VisitFrequency, string][] = [
      ['monthly', '2026-11-20'], ['quarterly', '2027-01-20'], ['biannual', '2027-04-20'], ['annual', '2027-10-20'],
    ];
    for (const [freq, next] of cases) expect(advanceDue('2026-10-20', freq)).toBe(next);
  });

  it('without a start date, month ends drift (31 Jan → 28 Feb → 28 Mar)', () => {
    expect(advanceDue('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advanceDue('2026-02-28', 'monthly')).toBe('2026-03-28');
  });

  it('with a start date, visits keep its day of the month', () => {
    expect(advanceDue('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-02-28');
    expect(advanceDue('2026-02-28', 'monthly', '2026-01-31')).toBe('2026-03-31');
    expect(advanceDue('2026-04-30', 'quarterly', '2026-01-31')).toBe('2026-07-31');
  });

  it('a visit done off-cadence goes to the next cadence date after it', () => {
    expect(advanceDue('2026-03-10', 'quarterly', '2026-01-15')).toBe('2026-04-15');
  });

  it('a start date after the visit is ignored', () => {
    expect(advanceDue('2026-01-10', 'annual', '2026-06-01')).toBe('2027-01-10');
  });
});

describe('daysBetween', () => {
  it('counts calendar days across both clock changes', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2); // BST ends 25 Oct
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // BST starts 29 Mar
    expect(daysBetween('2026-10-26', '2026-10-25')).toBe(-1);
  });
});

describe('contractDueState', () => {
  const active = (next_visit_due: string | null) => ({ status: 'active' as const, next_visit_due });

  it('due on the day is "due today", not overdue (finding M12)', () => {
    expect(contractDueState(active('2026-10-25'), '2026-10-25')).toEqual({ state: 'due_today', days: 0 });
    expect(contractDueState(active('2026-10-24'), '2026-10-25')).toEqual({ state: 'overdue', days: -1 });
    expect(contractDueState(active('2026-10-26'), '2026-10-25')).toEqual({ state: 'due_soon', days: 1 });
  });

  it('due soon is within 30 days', () => {
    expect(contractDueState(active('2026-11-24'), '2026-10-25').state).toBe('due_soon');
    expect(contractDueState(active('2026-11-25'), '2026-10-25').state).toBe('scheduled');
  });

  it('no date, or not active', () => {
    expect(contractDueState(active(null), '2026-10-25').state).toBe('not_scheduled');
    expect(contractDueState({ status: 'paused', next_visit_due: '2026-01-01' }, '2026-10-25').state).toBe('inactive');
  });

  it('labels', () => {
    expect(dueLabel({ state: 'overdue', days: -1 })).toBe('Overdue by 1 day');
    expect(dueLabel({ state: 'overdue', days: -3 })).toBe('Overdue by 3 days');
    expect(dueLabel({ state: 'due_soon', days: 1 })).toBe('Due in 1 day');
    expect(dueLabel({ state: 'due_today', days: 0 })).toBe('Due today');
  });
});
