import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { StatusPill } from '../../components/ui/StatusPill';
import { Spinner } from '../../components/ui/Spinner';
import type { Job, Jobsheet, Site } from '../../types';

export function SiteHistoryPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [entries, setEntries] = useState<{ job: Job; jobsheet: Jobsheet | null }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    async function load() {
      const s = await db.sites.get(siteId!).catch(() => null);
      if (!s) {
        const { data } = await supabase.from('sites').select('*').eq('id', siteId).single();
        if (data) setSite(data as Site);
      } else setSite(s);

      const { data: jobsData } = await supabase.from('jobs').select('*').eq('site_id', siteId).order('scheduled_date', { ascending: false });
      if (jobsData) {
        const result: { job: Job; jobsheet: Jobsheet | null }[] = [];
        for (const job of jobsData as Job[]) {
          const { data: jsData } = await supabase.from('jobsheets').select('*').eq('job_id', job.id).single();
          result.push({ job, jobsheet: jsData as Jobsheet | null });
        }
        setEntries(result);
      }
      setIsLoading(false);
    }
    load().catch(() => setIsLoading(false));
  }, [siteId]);

  return (
    <div className="px-4 pt-6 pb-4">
      <button onClick={() => navigate('/manager/sites')} className="text-blue-600 text-sm mb-4">‹ Back to sites</button>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Site History</h1>
      {site && <p className="text-sm text-gray-500 mb-4">{site.address}</p>}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No job history for this site</div>
      ) : (
        <div className="space-y-3">
          {entries.map(({ job, jobsheet }) => (
            <div key={job.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer" onClick={() => jobsheet && navigate(`/manager/jobs/${job.id}/review`)}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">{new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <StatusPill status={job.status} />
              </div>
              <p className="text-xs text-gray-500 capitalize">{job.template_id.replace(/_/g, ' ')}</p>
              {jobsheet?.pdf_url && <p className="text-xs text-blue-500 mt-1">PDF available</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
