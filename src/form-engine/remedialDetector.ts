import type { TemplateDef, FieldDef } from '../templates/types';
import type { AnswersMap, RemedialCreate, PassFailNote, YesNoNa, RemedialPriority } from '../types';

export function detectRemedials(
  template: TemplateDef,
  answers: AnswersMap,
  jobsheetId: string,
  siteId: string,
  companyId: string
): RemedialCreate[] {
  const remedials: RemedialCreate[] = [];

  function processFields(fields: FieldDef[], sectionAnswers: AnswersMap, sectionId: string) {
    // Find the priority field for this section's free-text remedials
    const priorityField = fields.find(f => f.id.endsWith('_priority') || f.id === 'remedial_priority' || f.id === 'additional_remedial_priority');
    const defaultPriority: RemedialPriority = (priorityField ? (sectionAnswers[priorityField.id] as RemedialPriority) : null) ?? 'recommended';

    for (const field of fields) {
      if (!field.triggers_remedial && !field.id.endsWith('_free_text')) continue;
      const value = sectionAnswers[field.id];
      if (value === null || value === undefined) continue;

      if (field.id.endsWith('_free_text') && typeof value === 'string') {
        // Each non-empty line becomes a remedial
        const lines = value.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          remedials.push({
            jobsheet_id: jobsheetId,
            site_id: siteId,
            company_id: companyId,
            description: line,
            priority: defaultPriority,
          });
        }
        continue;
      }

      if (!field.triggers_remedial) continue;
      const priority = field.remedial_priority ?? 'recommended';

      if (field.type === 'pass_fail_note') {
        const pfn = value as PassFailNote;
        if (pfn?.result === 'fail') {
          remedials.push({
            jobsheet_id: jobsheetId,
            site_id: siteId,
            company_id: companyId,
            description: `${field.label}${pfn.note ? ': ' + pfn.note : ' — failed'}`,
            priority,
          });
        }
      } else if (field.type === 'yes_no_na') {
        const yna = value as YesNoNa;
        if (yna === 'no') {
          remedials.push({
            jobsheet_id: jobsheetId,
            site_id: siteId,
            company_id: companyId,
            description: `${field.label} — not confirmed`,
            priority,
          });
        }
      }
    }
    // suppress unused param warning
    void sectionId;
  }

  for (const section of template.sections) {
    if (section.repeatable) {
      const key = section.id + '_instances';
      const instances = answers[key] as AnswersMap[] | undefined;
      if (instances) {
        instances.forEach(inst => processFields(section.fields, inst, section.id));
      }
    } else {
      processFields(section.fields, answers, section.id);
    }
  }

  return remedials;
}
