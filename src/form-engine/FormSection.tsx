import type { SectionDef, FieldDef } from '../templates/types';
import type { AnswersMap, FieldAnswer } from '../types';
import { TextField } from './fields/TextField';
import { LongTextField } from './fields/LongTextField';
import { YesNoNaField } from './fields/YesNoNaField';
import { PassFailNoteField } from './fields/PassFailNoteField';
import { NumberField } from './fields/NumberField';
import { SelectField } from './fields/SelectField';
import { ChecklistField } from './fields/ChecklistField';
import { PhotoField } from './fields/PhotoField';
import { SignatureField } from './fields/SignatureField';

interface FormSectionProps {
  section: SectionDef;
  answers: AnswersMap;
  onChange: (fieldId: string, value: FieldAnswer) => void;
  errors: Record<string, string>;
  readOnly: boolean;
}

export function FormSection({ section, answers, onChange, errors, readOnly }: FormSectionProps) {
  function renderField(field: FieldDef) {
    const value = answers[field.id] ?? null;
    const error = errors[field.id];
    const props = { field, value, onChange: (v: FieldAnswer) => onChange(field.id, v), readOnly, error };

    switch (field.type) {
      case 'text':           return <TextField key={field.id} {...props} />;
      case 'longtext':       return <LongTextField key={field.id} {...props} />;
      case 'yes_no_na':      return <YesNoNaField key={field.id} {...props} />;
      case 'pass_fail_note': return <PassFailNoteField key={field.id} {...props} />;
      case 'number':         return <NumberField key={field.id} {...props} />;
      case 'select':         return <SelectField key={field.id} {...props} />;
      case 'checklist':      return <ChecklistField key={field.id} {...props} />;
      case 'photo':          return <PhotoField key={field.id} {...props} />;
      case 'signature':      return <SignatureField key={field.id} {...props} />;
      default:               return null;
    }
  }

  return (
    <div className="mb-4">
      <div className="bg-blue-700 px-4 py-2">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wide">{section.title}</h2>
      </div>
      <div className="bg-white divide-y divide-gray-100">
        {section.fields.map(field => renderField(field))}
      </div>
    </div>
  );
}
