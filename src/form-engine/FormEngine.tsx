import { useMemo, useState } from 'react';
import type { TemplateDef, SectionDef } from '../templates/types';
import type { AnswersMap, FieldAnswer } from '../types';
import { validateAnswers, instanceErrorKey } from './validation';
import { FormSection } from './FormSection';
import { useFormState } from './useFormState';
import { FormMediaContext } from './FormContext';

interface FormEngineProps {
  template: TemplateDef;
  jobsheetId: string;
  companyId: string;
  readOnly?: boolean;
  onSave?: (answers: AnswersMap) => void;
  onSubmit?: (answers: AnswersMap) => void | Promise<void>;
}

export function FormEngine({ template, jobsheetId, companyId, readOnly = false, onSave, onSubmit }: FormEngineProps) {
  const { answers, setAnswer, isSaving, saveError, flush } = useFormState(jobsheetId, template);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  void repeatCounts;
  const media = useMemo(() => ({ jobsheetId, companyId }), [jobsheetId, companyId]);

  function validate(): boolean {
    const newErrors = validateAnswers(template, answers);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    if (!validate()) {
      // Scroll to first error
      setTimeout(() => {
        document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
      return;
    }
    setIsSubmitting(true);
    try {
      await flush();
      await onSubmit?.(answers);
    } finally {
      setIsSubmitting(false);
    }
  }

  /** errors for one repeat instance, keyed by plain field id as FormSection expects */
  function instanceErrors(section: SectionDef, index: number): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of section.fields) {
      const msg = errors[instanceErrorKey(section.id, index, field.id)];
      if (msg) out[field.id] = msg;
    }
    return out;
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
    const errKey = instanceErrorKey(section.id, index, fieldId);
    if (errors[errKey]) {
      setErrors(prev => { const n = {...prev}; delete n[errKey]; return n; });
    }
    const key = section.id + '_instances';
    const current = ((answers[key] as AnswersMap[] | undefined) ?? [{}]).map((inst, i) =>
      i === index ? { ...inst, [fieldId]: value } : inst
    );
    setAnswer(key, current);
  }

  return (
    <FormMediaContext.Provider value={media}>
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
                    errors={instanceErrors(section, idx)}
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
          {saveError ? (
            <p className="text-xs text-red-600 text-center mb-2" role="alert">
              Couldn't save on this device ({saveError}). Don't close the app — free up storage, then keep editing.
            </p>
          ) : isSaving && (
            <p className="text-xs text-gray-500 text-center mb-2">Auto-saving...</p>
          )}
          {Object.keys(errors).length > 0 && (
            <p className="text-xs text-red-600 text-center mb-2">
              {Object.keys(errors).length} field{Object.keys(errors).length !== 1 ? 's need' : ' needs'} attention
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl text-base active:bg-blue-700 disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting…' : 'Submit Jobsheet'}
          </button>
        </div>
      )}
    </div>
    </FormMediaContext.Provider>
  );
}
