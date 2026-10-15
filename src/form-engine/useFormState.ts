import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/db';
import type { TemplateDef } from '../templates/types';
import type { AnswersMap, FieldAnswer } from '../types';

export function useFormState(jobsheetId: string, _template: TemplateDef) {
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [isSaving, setIsSaving] = useState(false);
  const isDirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing answers from Dexie on mount
  useEffect(() => {
    let cancelled = false;
    db.jobsheets.get(jobsheetId).then(existing => {
      if (!cancelled && existing) {
        setAnswers(existing.answers ?? {});
      }
    }).catch(() => {/* jobsheet not created yet */});
    return () => { cancelled = true; };
  }, [jobsheetId]);

  const save = useCallback(async (currentAnswers: AnswersMap) => {
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const existing = await db.jobsheets.get(jobsheetId);
      if (existing) {
        await db.jobsheets.update(jobsheetId, { answers: currentAnswers, updated_at: now });
      }
      // If jobsheet doesn't exist yet in Dexie, it will be created by FillJobsheetPage
    } catch {
      // silently ignore — offline or not yet created
    } finally {
      setIsSaving(false);
      isDirtyRef.current = false;
    }
  }, [jobsheetId]);

  function setAnswer(fieldId: string, value: FieldAnswer) {
    setAnswers(prev => {
      const updated = { ...prev, [fieldId]: value };
      isDirtyRef.current = true;
      // Debounced save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => save(updated), 2000);
      return updated;
    });
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { answers, setAnswer, isSaving, save };
}
