import { v5 as uuidv5 } from 'uuid';

// Deterministic ids, so a record created twice (offline re-open, double submit,
// retry) gets the same id and the server ignores the duplicate.
const NAMESPACE = 'f0b7c1e2-5a3d-4c8e-9b6f-2d1a0e9c7b54';

/** One jobsheet per job. */
export function jobsheetIdFor(jobId: string): string {
  return uuidv5(`jobsheet|${jobId}`, NAMESPACE);
}

/** One remedial per (jobsheet, section, repeat instance, field, free-text line). */
export function remedialIdFor(
  jobsheetId: string, sectionId: string, instance: number, fieldId: string, line = 0,
): string {
  return uuidv5(`remedial|${jobsheetId}|${sectionId}|${instance}|${fieldId}|${line}`, NAMESPACE);
}

/** One device test per (jobsheet, device). */
export function deviceTestIdFor(jobsheetId: string, deviceId: string): string {
  return uuidv5(`device_test|${jobsheetId}|${deviceId}`, NAMESPACE);
}
