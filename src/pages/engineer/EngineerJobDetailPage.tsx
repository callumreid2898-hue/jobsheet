import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { fetchCached } from '../../lib/cachedQuery';
import { db } from '../../lib/db';
import { changeJobStatus } from '../../offline/SyncQueue';
import { engineerActions, type EngineerAction } from '../../lib/jobStatus';
import { StatusPill } from '../../components/ui/StatusPill';
import { Spinner } from '../../components/ui/Spinner';
import type { Device, Job, Site, Customer, System } from '../../types';

export function EngineerJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
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
        // Keep the site's devices on the phone for the scanner and the device tests
        if (navigator.onLine) void fetchCached<Device>({ table: 'devices', eq: { site_id: j.site_id } });
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

  const [isUpdating, setIsUpdating] = useState(false);

  // Arriving on site goes straight into the jobsheet
  async function runAction(action: EngineerAction) {
    if (!job || isUpdating) return;
    if (action.kind === 'fill') {
      navigate(`/jobs/${job.id}/fill`);
      return;
    }
    setIsUpdating(true);
    try {
      setJob(await changeJobStatus(job, action.to));
      if (action.to === 'on_site') navigate(`/jobs/${job.id}/fill`);
    } finally {
      setIsUpdating(false);
    }
  }

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!job || !site) return <div className="p-6 text-center text-gray-500">Job not found</div>;

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate('/jobs')} className="text-blue-600 text-sm mb-4 flex items-center gap-1">
        ‹ Back to jobs
      </button>

      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 pr-2">
          <h1 className="text-xl font-bold text-gray-900">{site.name}</h1>
          {site.address && site.address !== site.name && <p className="text-sm text-gray-500 mt-0.5">{site.address}</p>}
        </div>
        <StatusPill status={job.status} />
      </div>

      {site.hazards && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-0.5">⚠ Site hazards</p>
          <p className="text-sm text-red-900 whitespace-pre-wrap">{site.hazards}</p>
        </div>
      )}

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
        {site.keyholders?.length > 0 && (
          <div className="px-4 py-3" data-testid="keyholders">
            <p className="text-xs text-gray-400 mb-1">Keyholders (in calling order)</p>
            <ol className="space-y-1">
              {[...site.keyholders].sort((a, b) => a.order - b.order).map((k, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-900">{i + 1}. {k.name}</span>
                  {k.phone && <a href={`tel:${k.phone}`} className="text-blue-600 font-medium">{k.phone}</a>}
                </li>
              ))}
            </ol>
          </div>
        )}
        {(site.arc_name || site.arc_account || site.police_urn) && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Alarm monitoring</p>
            {(site.arc_name || site.arc_account) && (
              <p className="text-sm text-gray-900">ARC: {[site.arc_name, site.arc_account && `account ${site.arc_account}`].filter(Boolean).join(', ')}</p>
            )}
            {site.police_urn && <p className="text-sm text-gray-900">Police URN: {site.police_urn}</p>}
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
        {engineerActions(job.status).map((action, i) => (
          <button
            key={action.label}
            onClick={() => runAction(action)}
            disabled={isUpdating}
            className={i === 0
              ? 'w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base active:bg-blue-700 disabled:opacity-50'
              : 'w-full mt-3 bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-base active:bg-gray-50 disabled:opacity-50'}
          >
            {job.status === 'scheduled' && i === 0 ? 'Start job' : action.label}
          </button>
        ))}
        {job.status === 'unassigned' && (
          <p className="text-center py-3 text-sm text-gray-500">This job hasn't been scheduled yet. Ask the office to schedule it.</p>
        )}
        {['awaiting_review', 'reviewed', 'invoiced'].includes(job.status) && (
          <div className="text-center py-3 text-green-600 font-medium">✓ Jobsheet submitted</div>
        )}
      </div>
    </div>
  );
}
