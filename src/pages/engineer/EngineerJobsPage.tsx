import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useJobs } from '../../hooks/useJobs';
import { useSites } from '../../hooks/useSites';
import { JobCard } from '../../components/JobCard';
import { Spinner } from '../../components/ui/Spinner';
import type { Job } from '../../types';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function EngineerJobsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date()));
  const { jobs, isLoading } = useJobs({ date: selectedDate, engineerId: profile?.id });
  const { sites } = useSites();

  const siteMap = new Map(sites.map(s => [s.id, s]));

  function changeDate(delta: number) {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(formatDate(d));
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
          {selectedDate === formatDate(new Date()) && (
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
          <button onClick={() => setSelectedDate(formatDate(new Date()))} className="mt-3 text-sm text-blue-600 hover:underline">
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
