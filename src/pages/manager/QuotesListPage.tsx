import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuotes } from '../../hooks/useQuotes';
import { useSites } from '../../hooks/useSites';
import { Spinner } from '../../components/ui/Spinner';
import type { QuoteStatus } from '../../types';

const statusConfig: Record<QuoteStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-gray-100 text-gray-600' },
  sent:     { label: 'Sent',     className: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Accepted', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
};

const filterOptions: { value: QuoteStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

export function QuotesListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('');
  const { quotes, isLoading } = useQuotes({ status: statusFilter || undefined });
  const { sites } = useSites();
  const siteMap = new Map(sites.map(s => [s.id, s]));

  return (
    <div className="px-4 pt-6 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Quotes</h1>
        <button
          onClick={() => navigate('/manager/quotes/create')}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
        >
          + New Quote
        </button>
      </div>

      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value as QuoteStatus | '')}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm mb-4 bg-white"
      >
        {filterOptions.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No quotes found</div>
      ) : (
        <div className="space-y-3">
          {quotes.map(q => {
            const site = siteMap.get(q.site_id);
            const cfg = statusConfig[q.status];
            return (
              <div
                key={q.id}
                className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer active:bg-gray-50"
                onClick={() => navigate(`/manager/quotes/${q.id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-gray-900 text-sm">{q.reference}</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.className}`}>
                    {cfg.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-1">{site?.name ?? 'Unknown site'}</p>
                <p className="text-xs text-gray-400">{new Date(q.created_at).toLocaleDateString('en-GB')}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
