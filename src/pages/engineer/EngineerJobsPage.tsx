import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useJobs } from '../../hooks/useJobs';
import { useSites } from '../../hooks/useSites';
import { JobCard } from '../../components/JobCard';
import { Spinner } from '../../components/ui/Spinner';
import { addDaysISO, localISODate } from '../../lib/dates';
import { fetchCached } from '../../lib/cachedQuery';
import type { Device, Job } from '../../types';

export function EngineerJobsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(() => localISODate());
  const { jobs, isLoading } = useJobs({ date: selectedDate, engineerId: profile?.id });
  const { sites } = useSites();

  const siteMap = new Map(sites.map(s => [s.id, s]));

  // Save the day's sites' devices on the phone, so the scanner and device tests work without signal.
  // (Sites, with their hazards and keyholders, are saved by useSites.)
  const siteIds = [...new Set(jobs.map(j => j.site_id))].sort().join(',');
  useEffect(() => {
    if (!siteIds || !navigator.onLine) return;
    for (const siteId of siteIds.split(',')) void fetchCached<Device>({ table: 'devices', eq: { site_id: siteId } });
  }, [siteIds]);

  function changeDate(delta: number) {
    setSelectedDate(d => addDaysISO(d, delta));
  }

  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-gray-900 mb-4">My Jobs</h1>

      {/* Date picker */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
        <button onClick={() => changeDate(-1)} className="p-2 text-gray-400 hover:text-gray-600 min-w-[44px] flex justify-center">‹</button>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">{displayDate}</p>
          {selectedDate === localISODate() && (
            <span className="text-xs text-blue-600 font-medium">Today</span>
          )}
        </div>
        <button onClick={() => changeDate(1)} className="p-2 text-gray-400 hover:text-gray-600 min-w-[44px] flex justify-center">›</button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium">No jobs for this date</p>
          <button onClick={() => setSelectedDate(localISODate())} className="mt-3 text-sm text-blue-600 hover:underline">
            Back to today
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: Job) => {
            const site = siteMap.get(job.site_id);
            if (!site) return null;
            return (
              <JobCard
                key={job.id}
                job={job}
                site={site}
                onClick={() => navigate(`/jobs/${job.id}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
