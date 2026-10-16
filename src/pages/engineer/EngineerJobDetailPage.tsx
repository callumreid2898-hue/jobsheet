import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { enqueueSync } from '../../offline/SyncQueue';
import { useAuth } from '../../auth/AuthProvider';
import { StatusPill } from '../../components/ui/StatusPill';
import { Spinner } from '../../components/ui/Spinner';
import type { Job, Site, Customer, System } from '../../types';

export function EngineerJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [system, setSystem] = useState<System | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    async function load() {
      let j = await db.jobs.get(jobId!).catch(() => null);
      if (!j) {
        const { data } = await supabase.from('jobs').select('*').eq('id', jobId).single();
        if (data) { j = data as Job; await db.jobs.put(j).catch(() => {}); }
      }
      setJob(j ?? null);
      if (j) {
        let s = await db.sites.get(j.site_id).catch(() => null);
        if (!s) {
          const { data } = await supabase.from('sites').select('*').eq('id', j.site_id).single();
          if (data) { s = data as Site; await db.sites.put(s).catch(() => {}); }
        }
        setSite(s ?? null);
        if (s) {
          let c = await db.customers.get(s.customer_id).catch(() => null);
          if (!c) {
            const { data } = await supabase.from('customers').select('*').eq('id', s.customer_id).single();
            if (data) { c = data as Customer; await db.customers.put(c).catch(() => {}); }
          }
          setCustomer(c ?? null);
        }
        if (j.system_id) {
          let sys = await db.systems.get(j.system_id).catch(() => null);
          if (!sys) {
            const { data } = await supabase.from('systems').select('*').eq('id', j.system_id).single();
            if (data) { sys = data as System; await db.systems.put(sys).catch(() => {}); }
          }
          setSystem(sys ?? null);
        }
      }
      setIsLoading(false);
    }
    load().catch(() => setIsLoading(false));
  }, [jobId]);

  async function startJob() {
    if (!job || !profile) return;
    const updated: Job = { ...job, status: 'on_site', on_site_at: new Date().toISOString() };
    await db.jobs.put(updated);
    setJob(updated);
    await enqueueSync({ table: 'jobs', operation: 'upsert', payload: updated as unknown as Record<string, unknown> });
    navigate(`/jobs/${job.id}/fill`);
  }

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!job || !site) return <div className="p-6 text-center text-gray-500">Job not found</div>;

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate('/jobs')} className="text-blue-600 text-sm mb-4 flex items-center gap-1">
        ‹ Back to jobs
      </button>

      <div className="flex items-start justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex-1 pr-2">{site.address}</h1>
        <StatusPill status={job.status} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {customer && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Customer</p>
            <p className="text-sm font-medium text-gray-900">{customer.name}</p>
            {site.contact_name && <p className="text-xs text-gray-500">{site.contact_name} · {site.contact_phone}</p>}
          </div>
        )}
        {system && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">System</p>
            <p className="text-sm font-medium text-gray-900 capitalize">{system.type.replace(/_/g, ' ')}</p>
            {system.make && <p className="text-xs text-gray-500">{system.make} {system.model}</p>}
            {system.panel_location && <p className="text-xs text-gray-400">Panel: {system.panel_location}</p>}
          </div>
        )}
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Date</p>
          <p className="text-sm text-gray-900">{new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        {site.access_notes && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Access notes</p>
            <p className="text-sm text-gray-700">{site.access_notes}</p>
          </div>
        )}
        {job.notes && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Job notes</p>
            <p className="text-sm text-gray-700">{job.notes}</p>
          </div>
        )}
      </div>

      <div className="mt-6">
        {job.status === 'scheduled' && (
          <button onClick={startJob} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base active:bg-blue-700">
            Start Job
          </button>
        )}
        {job.status === 'on_site' && (
          <button onClick={() => navigate(`/jobs/${job.id}/fill`)} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base active:bg-blue-700">
            Continue Jobsheet
          </button>
        )}
        {job.status === 'awaiting_review' && (
          <div className="text-center py-3 text-green-600 font-medium">✓ Jobsheet submitted</div>
        )}
      </div>
    </div>
  );
}
