import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContracts } from '../../hooks/useContracts';
import { useSites } from '../../hooks/useSites';
import { Spinner } from '../../components/ui/Spinner';
import { localISODate } from '../../lib/dates';
import {
  CONTRACT_STATUS_CLASSES, DUE_STATE_CLASSES, FREQUENCY_LABELS, SYSTEM_TYPE_LABELS,
  contractDueState, dueLabel, formatISODate,
} from '../../lib/contracts';
import type { ContractStatus } from '../../types';

export function ContractsListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<ContractStatus | ''>('active');
  const { contracts, isLoading } = useContracts({ status: statusFilter || undefined });
  const { sites } = useSites();
  const siteMap = new Map(sites.map(s => [s.id, s]));
  const today = localISODate();

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
                      {site?.name ?? 'Unknown site'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {SYSTEM_TYPE_LABELS[contract.system_type] ?? contract.system_type}
                      {' · '}
                      {FREQUENCY_LABELS[contract.visit_frequency] ?? contract.visit_frequency}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Next visit: {formatISODate(contract.next_visit_due)}
                      {contract.status === 'active' && (() => {
                        const due = contractDueState(contract, today);
                        return <span className={`ml-2 font-medium ${DUE_STATE_CLASSES[due.state]}`}>{dueLabel(due)}</span>;
                      })()}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${CONTRACT_STATUS_CLASSES[contract.status]}`}>
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
