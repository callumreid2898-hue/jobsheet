import { useParams, useNavigate } from 'react-router-dom';
import { useSync } from '../../offline/useSync';
import { useOnline } from '../../lib/useOnline';

export function JobSubmittedPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { queueLength, isSyncing } = useSync();
  const isOnline = useOnline();

  const isQueued = queueLength > 0 || !isOnline;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${isQueued ? 'bg-amber-100' : 'bg-green-100'}`}>
        <span className="text-4xl">{isQueued ? '⏳' : '✅'}</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {isQueued ? 'Saved Offline' : 'Job Submitted'}
      </h1>

      <p className="text-gray-500 mb-6">
        {isSyncing ? 'Syncing with server…' :
          isQueued ? "Your jobsheet is saved locally and will sync automatically when you're back online." :
            'Your jobsheet has been submitted successfully.'}
      </p>

      {isQueued && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-700 w-full max-w-sm">
          {queueLength} item{queueLength !== 1 ? 's' : ''} queued for sync
        </div>
      )}

      <button
        onClick={() => navigate('/jobs')}
        className="w-full max-w-sm bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base"
      >
        Back to Jobs
      </button>
      <button
        onClick={() => navigate(`/jobs/${jobId}`)}
        className="mt-3 text-sm text-gray-400 underline"
      >
        View job details
      </button>
    </div>
  );
}
