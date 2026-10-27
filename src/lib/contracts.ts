import type { Contract, ContractStatus, ContractVisitStatus, SystemType, TemplateId, VisitFrequency } from '../types';

// PPM contract rules, shared by the contract pages, dashboard and reports.
// advanceDue() must match next_due_date() in 00014_ppm.sql.

export const SYSTEM_TYPE_LABELS: Record<SystemType, string> = {
  fire_alarm:         'Fire Alarm',
  emergency_lighting: 'Emergency Lighting',
  cctv:               'CCTV',
  intruder:           'Intruder',
  access_control:     'Access Control',
};

export const FREQUENCY_LABELS: Record<VisitFrequency, string> = {
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  biannual:  'Bi-annual',
  annual:    'Annual',
};

export const CONTRACT_STATUS_CLASSES: Record<ContractStatus, string> = {
  active:  'bg-green-100 text-green-700',
  paused:  'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
};

export const VISIT_STATUS_CLASSES: Record<ContractVisitStatus, string> = {
  pending:   'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  complete:  'bg-green-100 text-green-700',
};

/** The jobsheet a PPM visit uses for each system type (same as generate_visit_job). */
export const PPM_TEMPLATE: Record<SystemType, TemplateId> = {
  fire_alarm:         'fire_alarm_service',
  emergency_lighting: 'emergency_lighting_test',
  cctv:               'cctv_maintenance',
  intruder:           'corrective_maintenance',
  access_control:     'corrective_maintenance',
};

export const FREQUENCY_MONTHS: Record<VisitFrequency, number> = {
  monthly: 1, quarterly: 3, biannual: 6, annual: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Adds calendar months to 'YYYY-MM-DD', clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12; // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
}

/**
 * The visit after one due on `from`. With an anchor (the contract's start
 * date) visits stay on the anchor's day of the month, so a 31 Jan start is
 * 31 Mar after 28 Feb, not 28 Mar. Without one, it's `from` plus the interval.
 */
export function advanceDue(from: string, frequency: VisitFrequency, anchor?: string | null): string {
  const step = FREQUENCY_MONTHS[frequency];
  if (!anchor || anchor > from) return addMonthsISO(from, step);
  for (let k = 1; k < 1200; k++) {
    const next = addMonthsISO(anchor, step * k);
    if (next > from) return next;
  }
  return addMonthsISO(from, step);
}

/** Whole days from `today` to `iso` (both 'YYYY-MM-DD'; negative = past). Timezone-free. */
export function daysBetween(today: string, iso: string): number {
  const toUTC = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUTC(iso) - toUTC(today)) / 86_400_000);
}

export type DueState = 'not_scheduled' | 'overdue' | 'due_today' | 'due_soon' | 'scheduled' | 'inactive';

export const DUE_SOON_DAYS = 30;

/** Where a contract's next visit stands on `today` (local 'YYYY-MM-DD'). */
export function contractDueState(
  c: Pick<Contract, 'status' | 'next_visit_due'>, today: string,
): { state: DueState; days: number | null } {
  if (c.status !== 'active') return { state: 'inactive', days: null };
  if (!c.next_visit_due) return { state: 'not_scheduled', days: null };
  const days = daysBetween(today, c.next_visit_due);
  if (days < 0) return { state: 'overdue', days };
  if (days === 0) return { state: 'due_today', days };
  if (days <= DUE_SOON_DAYS) return { state: 'due_soon', days };
  return { state: 'scheduled', days };
}

export function dueLabel({ state, days }: { state: DueState; days: number | null }): string {
  switch (state) {
    case 'overdue':       return `Overdue by ${-days!} day${days === -1 ? '' : 's'}`;
    case 'due_today':     return 'Due today';
    case 'due_soon':
    case 'scheduled':     return `Due in ${days} day${days === 1 ? '' : 's'}`;
    case 'not_scheduled': return 'No visit date set';
    case 'inactive':      return 'Not active';
  }
}

export const DUE_STATE_CLASSES: Record<DueState, string> = {
  overdue:       'text-red-600',
  due_today:     'text-orange-600',
  due_soon:      'text-amber-600',
  scheduled:     'text-green-700',
  not_scheduled: 'text-slate-400',
  inactive:      'text-slate-400',
};

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
export function formatISODate(iso: string | null): string {
  if (!iso) return 'Not set';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
