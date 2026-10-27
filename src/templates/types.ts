import type { SystemType, JobType, RemedialPriority } from '../types/index';

export type FieldType =
  | 'text'
  | 'longtext'
  | 'yes_no_na'
  | 'pass_fail_note'
  | 'number'
  | 'select'
  | 'checklist'
  | 'photo'
  | 'signature';

export interface FieldDef {
  id: string;                            // stable key used in AnswersMap; snake_case
  type: FieldType;
  label: string;
  required?: boolean;
  options?: string[];                    // for 'select'
  items?: string[];                      // for 'checklist'
  hint?: string;
  triggers_remedial?: boolean;
  remedial_priority?: RemedialPriority;
  remedialOn?: 'yes' | 'no' | 'fail' | null;  // which answer fires the remedial (default: 'no' for yes_no_na, 'fail' for pass_fail_note)
  prefill?: PrefillKey;                  // filled from the job when the jobsheet is created (src/lib/jobsheetPrefill.ts)
}

/**
 * Job details a field can be pre-filled with. The `on_submit` ones are filled at
 * submit (if still blank), the rest when the engineer first opens the jobsheet.
 */
export type PrefillKey =
  | 'site'               // site name and address
  | 'date'               // the job's scheduled date, DD/MM/YYYY
  | 'call_no'
  | 'client_no'          // the job's, else the site's
  | 'visit_type'         // Maintenance / Repairs / Call out, from the job type
  | 'reported_fault'
  | 'engineer_name'
  | 'system_make_model'
  | 'zones'
  | 'loops'
  | 'arrival_time'       // HH:mm, from "On site"
  | 'travel_time'        // "Travelling" to "On site"
  | 'departure_time'     // on_submit
  | 'time_taken';        // on_submit: arrival to departure

export interface SectionDef {
  id: string;
  title: string;
  fields: FieldDef[];
  repeatable?: boolean;
  repeat_label?: string;                 // e.g. "Zone"
}

export interface TemplateDef {
  id: string;
  name: string;
  system_type: SystemType | null;
  job_type: JobType;
  sections: SectionDef[];
  version: number;
}
