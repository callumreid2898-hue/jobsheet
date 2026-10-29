import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabaseClient';
import { enqueueSync, enqueueJobStatus, syncKey } from '../../offline/SyncQueue';
import { jobsheetIdFor } from '../../lib/ids';
import { applyStatus } from '../../lib/jobStatus';
import { useAuth } from '../../auth/AuthProvider';
import { Spinner } from '../../components/ui/Spinner';
import { FormEngine } from '../../form-engine/FormEngine';
import { detectRemedials } from '../../form-engine/remedialDetector';
import { collectMedia, MEDIA_BUCKET } from '../../lib/media';
import { fetchOneCached } from '../../lib/cachedQuery';
import { prefillAnswers, fillSubmitAnswers } from '../../lib/jobsheetPrefill';
import { collectDeviceTests } from '../../lib/devices';
import type { Job, Jobsheet, AnswersMap, Photo, TemplateId, Site, Customer, System } from '../../types';
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
      const job = j;

      const tpl = (await import(`../../templates/${j.template_id}.json`)).default as TemplateDef;

      // Load or create jobsheet
      let js = await db.jobsheets.where('job_id').equals(j.id).first().catch(() => null);
      if (!js) {
        // Try Supabase
        const { data } = await supabase.from('jobsheets').select('*').eq('job_id', j.id).single();
        if (data) {
          js = data as Jobsheet;
          await db.jobsheets.put(js).catch(() => {});
        } else {
          // New jobsheet: start from what the job already says (site, call no., fault...)
          const site = await fetchOneCached<Site>('sites', job.site_id);
          const [customer, system] = await Promise.all([
            site ? fetchOneCached<Customer>('customers', site.customer_id) : null,
            job.system_id ? fetchOneCached<System>('systems', job.system_id) : null,
          ]);
          // Create new local jobsheet. The id is derived from the job, so opening the
          // job offline on two devices (or after clearing data) can't create two.
          js = {
            id: jobsheetIdFor(j.id),
            job_id: j.id,
            company_id: j.company_id,
            template_id: j.template_id as TemplateId,
            answers: prefillAnswers(tpl, { job, site, customer, system, engineerName: profile!.full_name }),
            time_on_site: j.on_site_at ?? new Date().toISOString(),
            time_off_site: null,
            engineer_signature_url: null,
            customer_signature_url: null,
            submitted_at: null,
            pdf_path: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await db.jobsheets.put(js).catch(() => {});
          await enqueueSync({ table: 'jobsheets', operation: 'insert', payload: js as unknown as Record<string, unknown> });
        }
      }
      // Already submitted (Back from /submitted, or a second tab): don't allow a second submission
      if (js.submitted_at) {
        if (!cancelled) navigate(`/jobs/${j.id}/submitted`, { replace: true });
        return;
      }
      if (!cancelled) setJobsheet(js);
      if (!cancelled) setTemplate(tpl);
      if (!cancelled) setIsLoading(false);
    }

    init().catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [jobId, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(answers: AnswersMap) {
    if (!jobsheet || !job || !profile) return;

    const timeOffSite = new Date().toISOString();
    const submittedAt = new Date().toISOString();

    // Detect remedials
    const remedialCreates = detectRemedials(template!, answers, jobsheet.id, job.site_id, profile.company_id);
    const deviceTests = collectDeviceTests(template!, answers, jobsheet.id, profile.company_id, submittedAt);
    const jobsheetKey = syncKey('jobsheets', jobsheet.id);

    // Photos and signatures still on this device get uploaded. Anything taken then
    // removed is dropped. (A referenced file missing here can't be sent from this device.)
    const media = collectMedia(template!, answers);
    const referenced = new Set([...media.photos, ...media.signatures].map(m => m.ref.storage_path));
    const localPaths = new Set(
      (await db.blobs.where('jobsheet_id').equals(jobsheet.id).primaryKeys()) as string[],
    );
    const signatureFor = (role: 'engineer' | 'customer') => {
      const path = media.signatures.find(s => s.role === role)?.ref.storage_path;
      return path && localPaths.has(path) ? path : null;
    };

    const updatedJs: Jobsheet = {
      ...jobsheet,
      answers,
      time_off_site: timeOffSite,
      engineer_signature_url: signatureFor('engineer') ?? jobsheet.engineer_signature_url,
      customer_signature_url: signatureFor('customer') ?? jobsheet.customer_signature_url,
      submitted_at: submittedAt,
      updated_at: new Date().toISOString(),
    };
    const updatedJob: Job = applyStatus(job, 'awaiting_review', submittedAt);

    // One transaction, so a crash can't leave half a submission queued.
    // The server logs the submission to audit_log itself (trigger on jobsheets).
    await db.transaction('rw', [db.remedials, db.device_tests, db.jobsheets, db.jobs, db.photos, db.blobs, db.sync_queue], async () => {
      await db.jobsheets.put(updatedJs);
      await enqueueSync({ table: 'jobsheets', operation: 'upsert', payload: updatedJs as unknown as Record<string, unknown> });
      const pdfDependsOn = [jobsheetKey];

      // Uploads need the jobsheet on the server (storage RLS checks it); photo rows need their file
      await db.blobs.bulkDelete([...localPaths].filter(p => !referenced.has(p)));
      const uploadKey = (path: string) => syncKey('storage', path);
      for (const path of localPaths) {
        if (!referenced.has(path)) continue;
        await enqueueSync({
          table: 'storage', operation: 'storage_upload',
          payload: { bucket: MEDIA_BUCKET, storage_path: path, blob_key: path },
          entity_id: path,
          depends_on: [jobsheetKey],
        });
        pdfDependsOn.push(uploadKey(path));
      }
      for (const { ref, label } of media.photos) {
        if (!localPaths.has(ref.storage_path)) continue;
        const photo: Photo = {
          id: ref.id,
          jobsheet_id: jobsheet.id,
          company_id: jobsheet.company_id,
          storage_path: ref.storage_path,
          caption: ref.caption ?? label,
          created_at: new Date().toISOString(),
        };
        await db.photos.put(photo);
        await enqueueSync({
          table: 'photos', operation: 'insert',
          payload: photo as unknown as Record<string, unknown>,
          depends_on: [uploadKey(ref.storage_path)],
        });
        pdfDependsOn.push(syncKey('photos', photo.id));
      }

      // Remedials and the status change wait for the jobsheet to reach the server
      for (const rc of remedialCreates) {
        const remedial = {
          ...rc,
          status: 'open' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await db.remedials.put(remedial);
        await enqueueSync({
          table: 'remedials', operation: 'insert',
          payload: remedial as unknown as Record<string, unknown>,
          depends_on: [jobsheetKey],
        });
        pdfDependsOn.push(syncKey('remedials', remedial.id));
      }

      // Device results go to each device's test history (insert-only; the ids are per jobsheet and device)
      for (const test of deviceTests) {
        await db.device_tests.put(test);
        await enqueueSync({
          table: 'device_tests', operation: 'insert',
          payload: test as unknown as Record<string, unknown>,
          depends_on: [jobsheetKey],
        });
      }

      await db.jobs.put(updatedJob);
      await enqueueJobStatus(job.id, 'awaiting_review', [jobsheetKey]);
      pdfDependsOn.push(syncKey('jobs', job.id));

      // The report is rendered once everything it shows is on the server
      await enqueueSync({
        table: 'pdf', operation: 'generate_pdf',
        payload: { jobsheet_id: jobsheet.id },
        entity_id: jobsheet.id,
        depends_on: pdfDependsOn,
      });
    });

    navigate(`/jobs/${job.id}/submitted`, { replace: true });
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
        siteId={job.site_id}
        systemId={job.system_id}
        readOnly={false}
        onSubmit={handleSubmit}
        prepareSubmit={answers => fillSubmitAnswers(template, answers, job, new Date())}
      />
    </div>
  );
}
