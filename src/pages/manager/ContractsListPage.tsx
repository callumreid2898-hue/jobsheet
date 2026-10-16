import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContracts } from '../../hooks/useContracts';
import { useSites } from '../../hooks/useSites';
import { Spinner } from '../../components/ui/Spinner';
import type { ContractStatus } from '../../types';

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  fire_alarm: 'Fire Alarm',
  emergency_lighting: 'Emergency Lighting',
  cctv: 'CCTV',
  intruder: 'Intruder',
  access_control: 'Access Control',
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannual: 'Bi-annual',
  annual: 'Annual',
};

const statusChipClass: Record<ContractStatus, string> = {
  active:  'bg-green-100 text-green-700',
  paused:  'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Not set';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function ContractsListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<ContractStatus | ''>('active');
  const { contracts, isLoading } = useContracts({ status: statusFilter || undefined });
  const { sites } = useSites();
  const siteMap = new Map(sites.map(s => [s.id, s]));

  return (
    <div className="px-4 pt-6 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Contracts</h1>
        <button
          onClick={() => navigate('/manager/contracts/create')}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
        >
          + New Contract
        </button>
      </div>

      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value as ContractStatus | '')}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm mb-4 bg-white"
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="expired">Expired</option>
      </select>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No contracts found</div>
      ) : (
        <div className="space-y-3">
          {contracts.map(contract => {
            const site = siteMap.get(contract.site_id);
            return (
              <div
                key={contract.id}
                onClick={() => navigate(`/manager/contracts/${contract.id}`)}
                className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate text-sm">
                      {site?.address ?? 'Unknown site'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {SYSTEM_TYPE_LABELS[contract.system_type] ?? contract.system_type}
                      {' · '}
                      {FREQUENCY_LABELS[contract.visit_frequency] ?? contract.visit_frequency}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Next visit: {formatDate(contract.next_visit_due)}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusChipClass[contract.status]}`}>
                    {contract.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
