// ============================================================
// Canonical shared types — ALL workstreams import from here.
// snake_case mirrors Postgres column names exactly.
// ============================================================

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type UserRole = 'engineer' | 'manager';

export type SystemType =
  | 'fire_alarm'
  | 'emergency_lighting'
  | 'cctv'
  | 'intruder'
  | 'access_control';

export type JobType = 'service' | 'reactive' | 'install';

export type JobStatus = 'scheduled' | 'in_progress' | 'submitted' | 'reviewed';

export type RemedialPriority = 'urgent' | 'recommended' | 'advisory';

export type RemedialStatus = 'open' | 'quoted' | 'done';

export type TemplateId =
  | 'reactive_callout'
  | 'fire_alarm_service'
  | 'emergency_lighting_test'
  | 'cctv_maintenance';

// ─── Database Row Types ────────────────────────────────────────────────────────
// These match Supabase Postgres columns exactly.

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  accreditation_number: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  company_id: string;
  role: UserRole;
  full_name: string;
  email: string;
  created_at: string;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
}

export interface Site {
  id: string;
  company_id: string;
  customer_id: string;
  address: string;
  contact_name: string | null;
  contact_phone: string | null;
  access_notes: string | null;
  created_at: string;
}

export interface System {
  id: string;
  site_id: string;
  company_id: string;
  type: SystemType;
  make: string | null;
  model: string | null;
  panel_location: string | null;
  notes: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  company_id: string;
  site_id: string;
  system_id: string | null;
  type: JobType;
  template_id: TemplateId;
  assigned_engineer_id: string | null;
  scheduled_date: string; // 'YYYY-MM-DD'
  status: JobStatus;
  notes: string | null;
  created_at: string;
}

export interface Jobsheet {
  id: string;
  job_id: string;
  company_id: string;
  template_id: TemplateId;
  answers: AnswersMap;
  time_on_site: string | null;
  time_off_site: string | null;
  engineer_signature_url: string | null;
  customer_signature_url: string | null;
  submitted_at: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  jobsheet_id: string;
  company_id: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
}

export interface Remedial {
  id: string;
  jobsheet_id: string;
  site_id: string;
  company_id: string;
  description: string;
  priority: RemedialPriority;
  status: RemedialStatus;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  company_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

// ─── JSONB Answer Map ─────────────────────────────────────────────────────────

export type AnswersMap = Record<string, FieldAnswer>;

export type FieldAnswer =
  | string
  | number
  | boolean
  | YesNoNa
  | PassFailNote
  | ChecklistAnswers
  | PhotoRef[]
  | SignatureRef
  | AnswersMap[] // repeatable section instances
  | null;

export type YesNoNa = 'yes' | 'no' | 'n/a';

export interface PassFailNote {
  result: 'pass' | 'fail' | null;
  note: string;
}

export type ChecklistAnswers = Record<string, boolean>;

export interface PhotoRef {
  id: string;
  local_uri?: string; // object URL for offline preview
  storage_path?: string;
  caption?: string;
}

export interface SignatureRef {
  storage_path: string;
  captured_at: string;
}

// ─── Sync Queue ───────────────────────────────────────────────────────────────

export type SyncOperation = 'upsert' | 'delete' | 'storage_upload';

export interface SyncQueueItem {
  id: string;
  table: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

// ─── Template / Form Engine ───────────────────────────────────────────────────

export type { FieldType, FieldDef, SectionDef, TemplateDef } from '../templates/types';

// ─── Auth Context Shape ───────────────────────────────────────────────────────

export interface AuthContextValue {
  session: import('@supabase/supabase-js').Session | null;
  profile: Profile | null;
  company: Company | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

// ─── Convenience type for creating a remedial (before it's persisted) ─────────

export type RemedialCreate = Omit<Remedial, 'id' | 'created_at' | 'updated_at' | 'status'>;

// ─── Photo with local Dexie blob (extended for offline storage) ───────────────

export interface PhotoLocal extends Photo {
  blob?: Blob;
}
