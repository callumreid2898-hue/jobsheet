import { useState } from 'react';
import type { TemplateDef, SectionDef } from '../templates/types';
import type { AnswersMap, FieldAnswer } from '../types';
import { FormSection } from './FormSection';
import { useFormState } from './useFormState';

interface FormEngineProps {
  template: TemplateDef;
  jobsheetId: string;
  companyId: string;
  readOnly?: boolean;
  onSave?: (answers: AnswersMap) => void;
  onSubmit?: (answers: AnswersMap) => void;
}

export function FormEngine({ template, jobsheetId, companyId, readOnly = false, onSave, onSubmit }: FormEngineProps) {
  const { answers, setAnswer, isSaving } = useFormState(jobsheetId, template);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    template.sections.forEach(s => {
      if (s.repeatable) {
        const key = s.id + '_instances';
        const instances = answers[key] as AnswersMap[] | undefined;
        initial[s.id] = instances?.length ?? 1;
      }
    });
    return initial;
  });

  // Suppress unused variable warning — companyId is available for future use
  void companyId;
  void repeatCounts;

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const section of template.sections) {
      if (section.repeatable) continue; // skip repeatable validation for now
      for (const field of section.fields) {
        if (field.required) {
          const val = answers[field.id];
          if (val === null || val === undefined || val === '') {
            newErrors[field.id] = 'This field is required';
          }
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) {
      // Scroll to first error
      const firstError = document.querySelector('[data-error="true"]');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onSubmit?.(answers);
  }

  function handleChange(fieldId: string, value: FieldAnswer) {
    setAnswer(fieldId, value);
    onSave?.(answers);
    if (errors[fieldId]) {
      setErrors(prev => { const n = {...prev}; delete n[fieldId]; return n; });
    }
  }

  function addRepeatInstance(section: SectionDef) {
    const key = section.id + '_instances';
    const current = (answers[key] as AnswersMap[] | undefined) ?? [{}];
    setAnswer(key, [...current, {}]);
    setRepeatCounts(prev => ({ ...prev, [section.id]: (prev[section.id] ?? 1) + 1 }));
  }

  function removeRepeatInstance(section: SectionDef, index: number) {
    const key = section.id + '_instances';
    const current = (answers[key] as AnswersMap[] | undefined) ?? [{}];
    const updated = current.filter((_, i) => i !== index);
    setAnswer(key, updated.length > 0 ? updated : [{}]);
    setRepeatCounts(prev => ({ ...prev, [section.id]: Math.max(1, (prev[section.id] ?? 1) - 1) }));
  }

  function updateRepeatInstance(section: SectionDef, index: number, fieldId: string, value: FieldAnswer) {
    const key = section.id + '_instances';
    const current = ((answers[key] as AnswersMap[] | undefined) ?? [{}]).map((inst, i) =>
      i === index ? { ...inst, [fieldId]: value } : inst
    );
    setAnswer(key, current);
  }

  return (
    <div className="pb-24">
      {template.sections.map((section) => {
        if (section.repeatable) {
          const key = section.id + '_instances';
          const instances = ((answers[key] as AnswersMap[] | undefined) ?? [{}]);
          return (
            <div key={section.id} className="mb-4">
              <div className="bg-blue-700 px-4 py-2">
                <h2 className="text-white font-semibold text-sm uppercase tracking-wide">{section.title}</h2>
              </div>
              {instances.map((instanceAnswers, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg m-3 overflow-hidden">
                  <div className="flex items-center justify-between bg-gray-100 px-4 py-2">
                    <span className="font-medium text-sm text-gray-700">{section.repeat_label ?? 'Item'} {idx + 1}</span>
                    {!readOnly && instances.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRepeatInstance(section, idx)}
                        className="text-red-500 text-xs hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <FormSection
                    section={section}
                    answers={instanceAnswers}
                    onChange={(fId, val) => updateRepeatInstance(section, idx, fId, val)}
                    errors={errors}
                    readOnly={readOnly ?? false}
                  />
                </div>
              ))}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => addRepeatInstance(section)}
                  className="mx-3 mb-3 flex items-center gap-2 text-blue-600 text-sm font-medium py-2 px-4 border border-blue-300 rounded-lg hover:bg-blue-50 active:bg-blue-100"
                >
                  <span className="text-lg leading-none">+</span>
                  Add {section.repeat_label ?? 'Item'}
                </button>
              )}
            </div>
          );
        }

        return (
          <FormSection
            key={section.id}
            section={section}
            answers={answers}
            onChange={handleChange}
            errors={errors}
            readOnly={readOnly ?? false}
          />
        );
      })}

      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-10">
          {isSaving && (
            <p className="text-xs text-gray-500 text-center mb-2">Auto-saving...</p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl text-base active:bg-blue-700"
          >
            Submit Jobsheet
          </button>
        </div>
      )}
    </div>
  );
}
