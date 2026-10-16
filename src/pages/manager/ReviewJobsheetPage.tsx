import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { useAuth } from '../../auth/AuthProvider';
import { Spinner } from '../../components/ui/Spinner';
import { StatusPill } from '../../components/ui/StatusPill';
import { FormEngine } from '../../form-engine/FormEngine';
import type { Job, Jobsheet, Site, Customer } from '../../types';
import type { TemplateDef } from '../../templates/types';

export function ReviewJobsheetPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [jobsheet, setJobsheet] = useState<Jobsheet | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [template, setTemplate] = useState<TemplateDef | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    async function load() {
      let j = await db.jobs.get(jobId!).catch(() => null);
      if (!j) {
        const { data } = await supabase.from('jobs').select('*').eq('id', jobId).single();
        if (data) { j = data as Job; await db.jobs.put(j).catch(() => {}); }
      }
      setJob(j ?? null);
      if (!j) { setIsLoading(false); return; }

      const { data: jsData } = await supabase.from('jobsheets').select('*').eq('job_id', j.id).single();
      if (jsData) {
        const js = jsData as Jobsheet;
        setJobsheet(js);
        await db.jobsheets.put(js).catch(() => {});
        const mod = await import(`../../templates/${js.template_id}.json`);
        setTemplate(mod.default as TemplateDef);
      }

      const s = await db.sites.get(j.site_id).catch(() => null);
      setSite(s ?? null);
      if (s) {
        const c = await db.customers.get(s.customer_id).catch(() => null);
        setCustomer(c ?? null);
      }
      setIsLoading(false);
    }
    load().catch(() => setIsLoading(false));
  }, [jobId]);

  async function markReviewed() {
    if (!job || !profile) return;
    setMarking(true);
    const updated: Job = { ...job, status: 'reviewed' };
    await db.jobs.put(updated);
    await supabase.from('jobs').update({ status: 'reviewed' }).eq('id', job.id);
    setJob(updated);
    setMarking(false);
  }

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!job || !jobsheet) return <div className="p-6 text-center text-gray-500">Jobsheet not found</div>;

  return (
    <div className="pb-8">
      <div className="sticky top-14 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <button onClick={() => navigate('/manager/jobs')} className="text-blue-600 text-sm">‹ Back</button>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="font-semibold text-gray-900 flex-1 truncate">{site?.address}</h1>
          <StatusPill status={job.status} />
        </div>
        {customer && <p className="text-xs text-gray-500">{customer.name}</p>}
      </div>

      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        {jobsheet.pdf_url ? (
          <a href={jobsheet.pdf_url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm font-medium flex items-center gap-1">
            📄 Download PDF
          </a>
        ) : (
          <span className="text-xs text-gray-400 italic">PDF generating…</span>
        )}
        {job.status === 'awaiting_review' && (
          <button onClick={markReviewed} disabled={marking} className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">
            {marking ? 'Saving…' : 'Mark Reviewed'}
          </button>
        )}
      </div>

      {template && (
        <FormEngine
          template={template}
          jobsheetId={jobsheet.id}
          companyId={profile?.company_id ?? ''}
          readOnly={true}
        />
      )}
    </div>
  );
}
