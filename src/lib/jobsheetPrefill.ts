import type { TemplateDef, FieldDef, PrefillKey } from '../templates/types';
import type { AnswersMap, Customer, FieldAnswer, Job, JobType, Site, System } from '../types';
import { formatUKTime } from './dates';

// Template fields marked `prefill` are filled from the job, so the engineer only
// writes what happened on site. Pure functions: safe to call any time.

export interface PrefillContext {
  job: Job;
  site: Site | null;
  customer: Customer | null;
  system: System | null;
  engineerName: string | null;
}

const ON_SUBMIT: PrefillKey[] = ['departure_time', 'time_taken'];

const VISIT_TYPE: Partial<Record<JobType, string>> = {
  ppm_service: 'Maintenance',
  remedial_works: 'Repairs',
  reactive_callout: 'Call out',
};

const isBlank = (v: FieldAnswer | undefined) => v === undefined || v === null || v === '';

/** "DD/MM/YYYY" from a 'YYYY-MM-DD' calendar date. */
function ukDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** e.g. "35m", "1h 05m" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function hhmmToMinutes(s: unknown): number | null {
  const m = typeof s === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(s.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Non-repeatable fields with a prefill key */
function prefillFields(template: TemplateDef): (FieldDef & { prefill: PrefillKey })[] {
  return template.sections
    .filter(s => !s.repeatable)
    .flatMap(s => s.fields)
    .filter((f): f is FieldDef & { prefill: PrefillKey } => !!f.prefill);
}

function valueFor(field: FieldDef, key: PrefillKey, ctx: PrefillContext): FieldAnswer {
  const { job, site, customer, system } = ctx;
  switch (key) {
    case 'site':
      return [...new Set([site?.name, site?.address].filter(Boolean))].join(', ') || customer?.name || null;
    case 'date':           return job.scheduled_date ? ukDate(job.scheduled_date) : null;
    case 'call_no':        return job.call_no;
    case 'client_no':      return job.client_no ?? site?.client_no ?? null;
    case 'visit_type': {
      const v = VISIT_TYPE[job.type];
      return v && (!field.options || field.options.includes(v)) ? v : null;
    }
    case 'reported_fault': return job.reported_fault;
    case 'engineer_name':  return ctx.engineerName;
    case 'system_make_model':
      return [system?.make, system?.model].filter(Boolean).join(' ') || null;
    case 'zones':          return system?.zones_count ?? null;
    case 'loops':          return system?.loops_count ?? null;
    case 'arrival_time':   return job.on_site_at ? formatUKTime(job.on_site_at) : null;
    case 'travel_time': {
      if (!job.travelling_at || !job.on_site_at) return null;
      const mins = (Date.parse(job.on_site_at) - Date.parse(job.travelling_at)) / 60000;
      return mins >= 0 ? formatDuration(mins) : null;
    }
    default:               return null;
  }
}

/** Answers for a new jobsheet: every prefill field the job has a value for. */
export function prefillAnswers(template: TemplateDef, ctx: PrefillContext): AnswersMap {
  const out: AnswersMap = {};
  for (const field of prefillFields(template)) {
    if (ON_SUBMIT.includes(field.prefill)) continue;
    const v = valueFor(field, field.prefill, ctx);
    if (!isBlank(v)) out[field.id] = v;
  }
  return out;
}

/**
 * At submit: fills departure time and time taken, plus arrival/travel if the
 * jobsheet was opened before "On site". Never overwrites what the engineer entered.
 */
export function fillSubmitAnswers(template: TemplateDef, answers: AnswersMap, job: Job, now: Date): AnswersMap {
  const out: AnswersMap = { ...answers };
  const fields = prefillFields(template);
  const ctx: PrefillContext = { job, site: null, customer: null, system: null, engineerName: null };

  for (const f of fields) {
    if ((f.prefill === 'arrival_time' || f.prefill === 'travel_time') && isBlank(out[f.id])) {
      const v = valueFor(f, f.prefill, ctx);
      if (!isBlank(v)) out[f.id] = v;
    }
  }
  const departureField = fields.find(f => f.prefill === 'departure_time');
  if (departureField && isBlank(out[departureField.id])) out[departureField.id] = formatUKTime(now.toISOString());

  const takenField = fields.find(f => f.prefill === 'time_taken');
  if (takenField && isBlank(out[takenField.id])) {
    // From the times on the sheet, so an engineer's correction to either counts
    const arrivalField = fields.find(f => f.prefill === 'arrival_time');
    const start = hhmmToMinutes(arrivalField ? out[arrivalField.id] : null);
    const end = hhmmToMinutes(departureField ? out[departureField.id] : formatUKTime(now.toISOString()));
    if (start !== null && end !== null) out[takenField.id] = formatDuration((end - start + 1440) % 1440);
  }
  return out;
}
