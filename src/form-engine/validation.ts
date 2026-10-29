import type { TemplateDef, FieldDef } from '../templates/types';
import type { AnswersMap, FieldAnswer, PassFailNote, PhotoRef, SignatureRef, ChecklistAnswers, DeviceTestAnswers } from '../types';

export function instanceErrorKey(sectionId: string, index: number, fieldId: string): string {
  return `${sectionId}.${index}.${fieldId}`;
}

/** Whether a field has a real answer, by type. `{ result: null }`, `[]` and whitespace don't count. */
export function isAnswered(field: FieldDef, value: FieldAnswer | undefined): boolean {
  if (value === null || value === undefined) return false;
  switch (field.type) {
    case 'pass_fail_note':
      return (value as PassFailNote).result != null;
    case 'checklist':
      return Object.values(value as ChecklistAnswers).some(Boolean);
    case 'photo':
      return Array.isArray(value) && (value as PhotoRef[]).length > 0;
    case 'signature':
      return Boolean((value as SignatureRef).storage_path);
    case 'device_tests':
      return Object.values(value as DeviceTestAnswers).some(e => e?.result != null);
    case 'number':
      return typeof value === 'number' ? !Number.isNaN(value) : String(value).trim() !== '';
    default:
      return typeof value === 'string' ? value.trim() !== '' : true;
  }
}

function fieldError(field: FieldDef, value: FieldAnswer | undefined): string | null {
  if (field.required && !isAnswered(field, value)) return 'This field is required';
  if (field.type === 'pass_fail_note') {
    const pfn = value as PassFailNote | undefined;
    if (pfn?.result === 'fail' && !pfn.note?.trim()) return 'Add a note explaining the fail';
  }
  if (field.type === 'device_tests' && value) {
    const unexplained = Object.values(value as DeviceTestAnswers).filter(e => e?.result === 'fail' && !e.note?.trim());
    if (unexplained.length) return `Add a note for each failed device (${unexplained.map(e => e.label).join(', ')})`;
  }
  return null;
}

/**
 * Errors keyed by field id, or by instanceErrorKey() for repeatable sections.
 * Empty when the jobsheet can be submitted.
 */
export function validateAnswers(template: TemplateDef, answers: AnswersMap): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const section of template.sections) {
    if (section.repeatable) {
      const instances = (answers[section.id + '_instances'] as AnswersMap[] | undefined) ?? [{}];
      instances.forEach((inst, i) => {
        for (const field of section.fields) {
          const err = fieldError(field, inst[field.id]);
          if (err) errors[instanceErrorKey(section.id, i, field.id)] = err;
        }
      });
    } else {
      for (const field of section.fields) {
        const err = fieldError(field, answers[field.id]);
        if (err) errors[field.id] = err;
      }
    }
  }
  return errors;
}
