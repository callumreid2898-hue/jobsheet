import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../../hooks/useJobs';
import { useSites } from '../../hooks/useSites';
import { useProfiles } from '../../hooks/useProfiles';
import { JobCard } from '../../components/JobCard';
import { Spinner } from '../../components/ui/Spinner';
import type { JobStatus } from '../../types';

export function ManagerJobsListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('');
  const { jobs, isLoading } = useJobs({ status: statusFilter || undefined });
  const { sites } = useSites();
  const { profiles } = useProfiles();
  const siteMap = new Map(sites.map(s => [s.id, s]));

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">All Jobs</h1>
        <button onClick={() => navigate('/manager/jobs/create')} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
          + New Job
        </button>
      </div>

      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value as JobStatus | '')}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm mb-4 bg-white"
      >
        <option value="">All statuses</option>
        <option value="unassigned">Unassigned</option>
        <option value="scheduled">Scheduled</option>
        <option value="travelling">Travelling</option>
        <option value="on_site">On Site</option>
        <option value="completed">Completed</option>
        <option value="awaiting_review">Awaiting Review</option>
        <option value="reviewed">Reviewed</option>
        <option value="invoiced">Invoiced</option>
        <option value="cancelled">Cancelled</option>
      </select>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No jobs found</div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const site = siteMap.get(job.site_id);
            if (!site) return null;
            const engineer = profiles.find(p => p.id === job.assigned_engineer_id);
            return (
              <div key={job.id} onClick={() => navigate(`/manager/jobs/${job.id}`)} className="cursor-pointer">
                <JobCard job={job} site={site} />
                {engineer && <p className="text-xs text-gray-400 px-1 mt-1">Engineer: {engineer.full_name}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
