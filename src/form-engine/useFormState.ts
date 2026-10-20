import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/db';
import type { TemplateDef } from '../templates/types';
import type { AnswersMap, FieldAnswer } from '../types';

export function useFormState(jobsheetId: string, _template: TemplateDef) {
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDirtyRef = useRef(false);
  const latestRef = useRef<AnswersMap>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing answers from Dexie on mount, unless the user has already started typing
  useEffect(() => {
    let cancelled = false;
    db.jobsheets.get(jobsheetId).then(existing => {
      if (!cancelled && existing && !isDirtyRef.current) {
        latestRef.current = existing.answers ?? {};
        setAnswers(latestRef.current);
      }
    }).catch(() => {/* jobsheet not created yet */});
    return () => { cancelled = true; };
  }, [jobsheetId]);

  const save = useCallback(async (currentAnswers: AnswersMap) => {
    setIsSaving(true);
    try {
      // If the jobsheet isn't in Dexie yet, FillJobsheetPage creates it
      await db.jobsheets.update(jobsheetId, { answers: currentAnswers, updated_at: new Date().toISOString() });
      isDirtyRef.current = false;
      setSaveError(null);
    } catch (err) {
      // e.g. QuotaExceededError — the answers are still in memory, so tell the user
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [jobsheetId]);

  /** Writes any pending edit now (Back, app backgrounded, before submit). */
  const flush = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (isDirtyRef.current) await save(latestRef.current);
  }, [save]);

  function setAnswer(fieldId: string, value: FieldAnswer) {
    setAnswers(prev => {
      const updated = { ...prev, [fieldId]: value };
      latestRef.current = updated;
      isDirtyRef.current = true;
      // Debounced save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => save(updated), 2000);
      return updated;
    });
  }

  // Save on unmount and when the page is hidden (app switch, SW update reload)
  useEffect(() => {
    const onHide = () => { flush().catch(() => {}); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') onHide(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      onHide();
    };
  }, [flush]);

  return { answers, setAnswer, isSaving, saveError, save, flush };
}
