import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCached, fetchOneCached } from '../../lib/cachedQuery';
import { writeRecord } from '../../lib/writeRecord';
import { useAuth } from '../../auth/AuthProvider';
import { Spinner } from '../../components/ui/Spinner';
import type { Contract, ContractVisit, ContractStatus, ContractVisitStatus, Site } from '../../types';

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

const visitChipClass: Record<ContractVisitStatus, string> = {
  pending:   'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  complete:  'bg-green-100 text-green-700',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Not set';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

const STATUS_BUTTONS: { value: ContractStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
];

export function ContractDetailPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [contract, setContract] = useState<Contract | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [visits, setVisits] = useState<ContractVisit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addingVisit, setAddingVisit] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [savingVisit, setSavingVisit] = useState(false);

  async function loadVisits() {
    if (!contractId) return;
    const { rows } = await fetchCached<ContractVisit>({
      table: 'contract_visits', eq: { contract_id: contractId }, order: { column: 'scheduled_date', ascending: false },
    });
    setVisits(rows);
  }

  useEffect(() => {
    if (!contractId) return;
    async function init() {
      setIsLoading(true);
      const c = await fetchOneCached<Contract>('contracts', contractId!);
      setContract(c);
      if (c?.site_id) setSite(await fetchOneCached<Site>('sites', c.site_id));
      await loadVisits();
      setIsLoading(false);
    }
    init();
  }, [contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(status: ContractStatus) {
    if (!contract) return;
    const now = new Date().toISOString();
    const updated = { ...contract, status, updated_at: now };
    setContract(updated);
    await writeRecord('contracts', 'update', { id: contract.id, status, updated_at: now });
  }

  async function handleAddVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !contractId || !visitDate) return;
    setSavingVisit(true);
    const visit: ContractVisit = {
      id: crypto.randomUUID(),
      contract_id: contractId,
      company_id: profile.company_id,
      job_id: null,
      scheduled_date: visitDate,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    await writeRecord('contract_visits', 'insert', { ...visit });
    setVisitDate('');
    setAddingVisit(false);
    setSavingVisit(false);
    await loadVisits();
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  if (!contract) {
    return (
      <div className="px-4 pt-6">
        <button onClick={() => navigate('/manager/contracts')} className="text-blue-600 text-sm mb-4 inline-block">‹ Back</button>
        <p className="text-center py-12 text-gray-400">Contract not found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate('/manager/contracts')} className="text-blue-600 text-sm mb-4 inline-block">
        ‹ Back
      </button>

      {/* Contract card */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{site?.address ?? 'Unknown site'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{contract.reference ?? 'No reference'}</p>
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusChipClass[contract.status]}`}>
            {contract.status}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
          <div>
            <dt className="text-xs text-gray-400">System type</dt>
            <dd className="font-medium text-gray-800">{SYSTEM_TYPE_LABELS[contract.system_type] ?? contract.system_type}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Frequency</dt>
            <dd className="font-medium text-gray-800">{FREQUENCY_LABELS[contract.visit_frequency] ?? contract.visit_frequency}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-gray-400">Next visit due</dt>
            <dd className="font-medium text-gray-800">{formatDate(contract.next_visit_due)}</dd>
          </div>
          {contract.notes && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-400">Notes</dt>
              <dd className="text-gray-700">{contract.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Status toggle */}
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-700 mb-2">Status</p>
        <div className="flex gap-2">
          {STATUS_BUTTONS.map(btn => (
            <button
              key={btn.value}
              onClick={() => handleStatusChange(btn.value)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                contract.status === btn.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Visits */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Visits</h2>
          <button
            onClick={() => setAddingVisit(v => !v)}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
          >
            {addingVisit ? 'Cancel' : 'Add Visit'}
          </button>
        </div>

        {addingVisit && (
          <form onSubmit={handleAddVisit} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-3 flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date <span className="text-red-500">*</span></label>
              <input
                required
                type="date"
                value={visitDate}
                onChange={e => setVisitDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={savingVisit}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60"
            >
              {savingVisit ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}

        {visits.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No visits recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {visits.map(visit => (
              <div key={visit.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{formatDate(visit.scheduled_date)}</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${visitChipClass[visit.status]}`}>
                  {visit.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
