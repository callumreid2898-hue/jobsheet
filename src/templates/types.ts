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
}

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
