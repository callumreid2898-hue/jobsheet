import type { TemplateId } from '../types/index';

/** Jobsheet templates in the order managers pick them */
export const TEMPLATE_OPTIONS: { value: TemplateId; label: string }[] = [
  { value: 'fire_alarm_service',     label: 'Fire Alarm Service' },
  { value: 'fire_alarm_inspection',  label: 'Fire Alarm Inspection' },
  { value: 'corrective_maintenance', label: 'Corrective Maintenance' },
  { value: 'reactive_callout',       label: 'Reactive Callout' },
  { value: 'emergency_lighting_test',label: 'Emergency Lighting Test' },
  { value: 'cctv_maintenance',       label: 'CCTV Maintenance' },
  { value: 'cctv_handover',          label: 'CCTV Handover' },
];
