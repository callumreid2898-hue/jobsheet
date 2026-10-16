import { useState } from 'react';
import { useRemedials } from '../../hooks/useRemedials';
import { useSites } from '../../hooks/useSites';
import { RemedialRow } from '../../components/RemedialRow';
import { Spinner } from '../../components/ui/Spinner';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import type { Remedial, RemedialStatus } from '../../types';

export function RemedialsListPage() {
  const [statusFilter, setStatusFilter] = useState<RemedialStatus | ''>('open');
  const { remedials, isLoading, refetch } = useRemedials({ status: statusFilter || undefined });
  const { sites } = useSites();
  const siteMap = new Map(sites.map(s => [s.id, s]));

  async function updateStatus(remedial: Remedial, status: RemedialStatus) {
    const updated: Remedial = { ...remedial, status, updated_at: new Date().toISOString() };
    await db.remedials.put(updated).catch(() => {});
    await supabase.from('remedials').update({ status }).eq('id', remedial.id);
    refetch();
  }

  const urgentCount = remedials.filter(r => r.priority === 'urgent' && r.status === 'open').length;

  function downloadCsv() {
    const rows = [
      ['Priority', 'Description', 'Site', 'Status', 'Created'],
      ...remedials.map(r => [
        r.priority,
        r.description,
        siteMap.get(r.site_id)?.address ?? r.site_id,
        r.status,
        r.created_at ?? '',
      ]),
    ];
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'remedials.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Remedials</h1>
        <div className="flex items-center gap-2">
          {urgentCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {urgentCount} urgent
            </span>
          )}
          <button
            onClick={downloadCsv}
            className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value as RemedialStatus | '')}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm mb-4 bg-white"
      >
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="quoted">Quoted</option>
        <option value="done">Done</option>
      </select>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : remedials.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No remedials found</div>
      ) : (
        <div className="space-y-3">
          {remedials.map(r => {
            const site = siteMap.get(r.site_id);
            if (!site) return null;
            return <RemedialRow key={r.id} remedial={r} site={site} onStatusChange={status => updateStatus(r, status)} />;
          })}
        </div>
      )}
    </div>
  );
}
