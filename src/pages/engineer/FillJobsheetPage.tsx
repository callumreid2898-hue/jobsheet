import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabaseClient';
import { enqueueSync } from '../../offline/SyncQueue';
import { useAuth } from '../../auth/AuthProvider';
import { Spinner } from '../../components/ui/Spinner';
import { FormEngine } from '../../form-engine/FormEngine';
import { detectRemedials } from '../../form-engine/remedialDetector';
import type { Job, Jobsheet, AnswersMap, TemplateId } from '../../types';
import type { TemplateDef } from '../../templates/types';

export function FillJobsheetPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [jobsheet, setJobsheet] = useState<Jobsheet | null>(null);
  const [template, setTemplate] = useState<TemplateDef | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!jobId || !profile) return;
    let cancelled = false;

    async function init() {
      // Load job
      let j = await db.jobs.get(jobId!).catch(() => null);
      if (!j) {
        const { data } = await supabase.from('jobs').select('*').eq('id', jobId).single();
        if (data) { j = data as Job; await db.jobs.put(j).catch(() => {}); }
      }
      if (!j || cancelled) { setIsLoading(false); return; }
      setJob(j);

      // Load or create jobsheet
      let js = await db.jobsheets.where('job_id').equals(j.id).first().catch(() => null);
      if (!js) {
        // Try Supabase
        const { data } = await supabase.from('jobsheets').select('*').eq('job_id', j.id).single();
        if (data) {
          js = data as Jobsheet;
          await db.jobsheets.put(js).catch(() => {});
        } else {
          // Create new local jobsheet
          js = {
            id: crypto.randomUUID(),
            job_id: j.id,
            company_id: j.company_id,
            template_id: j.template_id as TemplateId,
            answers: {},
            time_on_site: new Date().toISOString(),
            time_off_site: null,
            engineer_signature_url: null,
            customer_signature_url: null,
            submitted_at: null,
            pdf_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await db.jobsheets.put(js).catch(() => {});
          await enqueueSync({ table: 'jobsheets', operation: 'upsert', payload: js as unknown as Record<string, unknown> });
        }
      }
      if (!cancelled) setJobsheet(js);

      // Load template
      const mod = await import(`../../templates/${j.template_id}.json`);
      if (!cancelled) setTemplate(mod.default as TemplateDef);
      if (!cancelled) setIsLoading(false);
    }

    init().catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [jobId, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(answers: AnswersMap) {
    if (!jobsheet || !job || !profile) return;

    const site = await db.sites.get(job.site_id).catch(() => null);
    if (!site) return;

    const timeOffSite = new Date().toISOString();
    const submittedAt = new Date().toISOString();

    // Detect remedials
    const remedialCreates = detectRemedials(template!, answers, jobsheet.id, site.id, profile.company_id);

    // Save each remedial to Dexie + sync queue
    for (const rc of remedialCreates) {
      const remedial = {
        ...rc,
        id: crypto.randomUUID(),
        status: 'open' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.remedials.put(remedial).catch(() => {});
      await enqueueSync({ table: 'remedials', operation: 'upsert', payload: remedial as unknown as Record<string, unknown> });
    }

    // Update jobsheet
    const updatedJs: Jobsheet = {
      ...jobsheet,
      answers,
      time_off_site: timeOffSite,
      submitted_at: submittedAt,
      updated_at: new Date().toISOString(),
    };
    await db.jobsheets.put(updatedJs).catch(() => {});
    await enqueueSync({ table: 'jobsheets', operation: 'upsert', payload: updatedJs as unknown as Record<string, unknown> });

    // Update job status
    const updatedJob: Job = { ...job, status: 'submitted' };
    await db.jobs.put(updatedJob).catch(() => {});
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: updatedJob as unknown as Record<string, unknown> });

    // Audit log
    await enqueueSync({
      table: 'audit_log', operation: 'upsert',
      payload: {
        id: crypto.randomUUID(),
        company_id: profile.company_id,
        user_id: profile.user_id,
        action: 'jobsheet_submitted',
        entity_type: 'jobsheets',
        entity_id: jobsheet.id,
        created_at: new Date().toISOString(),
      }
    });

    navigate(`/jobs/${job.id}/submitted`);
  }

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!job || !jobsheet || !template) return <div className="p-6 text-center text-gray-500">Job not found</div>;

  return (
    <div>
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <button onClick={() => navigate(`/jobs/${jobId}`)} className="text-blue-600 text-sm">‹ Back</button>
        <h1 className="font-semibold text-gray-900 text-center -mt-5">{template.name}</h1>
      </div>
      <FormEngine
        template={template}
        jobsheetId={jobsheet.id}
        companyId={profile?.company_id ?? ''}
        readOnly={false}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
