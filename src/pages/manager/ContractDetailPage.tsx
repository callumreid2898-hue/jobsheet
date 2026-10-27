import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchCached, fetchOneCached } from '../../lib/cachedQuery';
import { writeRecord } from '../../lib/writeRecord';
import { supabase } from '../../lib/supabaseClient';
import { showToast } from '../../lib/toast';
import { localISODate } from '../../lib/dates';
import { useOnline } from '../../lib/useOnline';
import {
  CONTRACT_STATUS_CLASSES, DUE_STATE_CLASSES, FREQUENCY_LABELS, SYSTEM_TYPE_LABELS, VISIT_STATUS_CLASSES,
  contractDueState, dueLabel, formatISODate,
} from '../../lib/contracts';
import { useAuth } from '../../auth/AuthProvider';
import { useProfiles } from '../../hooks/useProfiles';
import { Spinner } from '../../components/ui/Spinner';
import type { Contract, ContractVisit, ContractStatus, Site } from '../../types';

const STATUS_BUTTONS: { value: ContractStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
];

export function ContractDetailPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isOnline = useOnline();
  const { profiles: engineers } = useProfiles({ role: 'engineer' });
  const [contract, setContract] = useState<Contract | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [visits, setVisits] = useState<ContractVisit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addingVisit, setAddingVisit] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitError, setVisitError] = useState<string | null>(null);
  const [savingVisit, setSavingVisit] = useState(false);
  const [engineerId, setEngineerId] = useState('');
  const [generating, setGenerating] = useState<string | null>(null); // visit date being generated

  async function loadVisits() {
    if (!contractId) return;
    const { rows } = await fetchCached<ContractVisit>({
      table: 'contract_visits', eq: { contract_id: contractId }, order: { column: 'scheduled_date', ascending: false },
    });
    setVisits(rows);
  }

  async function load() {
    const c = await fetchOneCached<Contract>('contracts', contractId!);
    setContract(c);
    if (c?.site_id) setSite(await fetchOneCached<Site>('sites', c.site_id));
    await loadVisits();
  }

  useEffect(() => {
    if (!contractId) return;
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(status: ContractStatus) {
    if (!contract) return;
    const now = new Date().toISOString();
    setContract({ ...contract, status, updated_at: now });
    await writeRecord('contracts', 'update', { id: contract.id, status, updated_at: now });
  }

  /** Creates the visit for `date` (if needed) and its PPM job, on the server (generate_visit_job). */
  async function generateJob(date: string) {
    if (!contract) return;
    setGenerating(date);
    const { data, error } = await supabase.rpc('generate_visit_job', {
      p_contract_id: contract.id, p_date: date, p_engineer_id: engineerId || null,
    });
    setGenerating(null);
    if (error) {
      showToast(error.message, 'error', 8000);
      return;
    }
    showToast(engineerId ? 'Job created and scheduled.' : 'Job created. Assign it on the planner.', 'success');
    await loadVisits();
    navigate(`/manager/jobs/${data as string}`);
  }

  async function handleAddVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !contractId || !visitDate) return;
    if (visits.some(v => v.scheduled_date === visitDate)) {
      setVisitError('There is already a visit on that date.');
      return;
    }
    setVisitError(null);
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

  const due = contractDueState(contract, localISODate());
  const nextVisit = contract.next_visit_due ? visits.find(v => v.scheduled_date === contract.next_visit_due) : undefined;

  return (
    <div className="px-4 pt-6 pb-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/manager/contracts')} className="text-blue-600 text-sm inline-block">‹ Back</button>
        <Link to={`/manager/contracts/${contract.id}/edit`} className="text-sm text-blue-600 font-medium">Edit</Link>
      </div>

      {/* Contract card */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{site?.name ?? 'Unknown site'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{contract.reference ?? 'No reference'}</p>
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${CONTRACT_STATUS_CLASSES[contract.status]}`}>
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
          <div>
            <dt className="text-xs text-gray-400">Start</dt>
            <dd className="font-medium text-gray-800">{formatISODate(contract.start_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">End</dt>
            <dd className="font-medium text-gray-800">{formatISODate(contract.end_date)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-gray-400">Next visit due</dt>
            <dd className="font-medium text-gray-800">
              {formatISODate(contract.next_visit_due)}
              <span className={`ml-2 text-xs font-medium ${DUE_STATE_CLASSES[due.state]}`} data-testid="due-state">{dueLabel(due)}</span>
            </dd>
          </div>
          {contract.notes && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-400">Notes</dt>
              <dd className="text-gray-700">{contract.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Next visit → job */}
      {contract.status === 'active' && contract.next_visit_due && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Next visit · {formatISODate(contract.next_visit_due)}</h2>
          {nextVisit?.job_id ? (
            <p className="text-sm text-gray-600">
              Job created: <Link to={`/manager/jobs/${nextVisit.job_id}`} className="text-blue-600 font-medium">open job</Link>.
              The next date is set once the engineer submits it.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={engineerId}
                onChange={e => setEngineerId(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                aria-label="Engineer for the visit"
              >
                <option value="">Assign later (planner)</option>
                {engineers.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <button
                onClick={() => generateJob(contract.next_visit_due!)}
                disabled={!isOnline || generating !== null}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-60"
              >
                {generating === contract.next_visit_due ? 'Creating…' : 'Create job for this visit'}
              </button>
              {!isOnline && <p className="w-full text-xs text-gray-500">Creating jobs from visits needs a connection.</p>}
            </div>
          )}
        </div>
      )}

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
            onClick={() => { setAddingVisit(v => !v); setVisitError(null); }}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
          >
            {addingVisit ? 'Cancel' : 'Add Visit'}
          </button>
        </div>

        {addingVisit && (
          <form onSubmit={handleAddVisit} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-3">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label htmlFor="visit-date" className="block text-sm font-medium text-gray-700 mb-1">Date <span className="text-red-500">*</span></label>
                <input
                  id="visit-date"
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
            </div>
            {visitError && <p className="text-xs text-red-600 mt-2" role="alert">{visitError}</p>}
          </form>
        )}

        {visits.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No visits recorded yet.</p>
        ) : (
          <div className="space-y-2" data-testid="contract-visits">
            {visits.map(visit => (
              <div key={visit.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-800">{formatISODate(visit.scheduled_date)}</span>
                <div className="flex items-center gap-3">
                  {visit.job_id ? (
                    <Link to={`/manager/jobs/${visit.job_id}`} className="text-xs text-blue-600 font-medium">Job</Link>
                  ) : visit.status === 'pending' && contract.status === 'active' && (
                    <button
                      onClick={() => generateJob(visit.scheduled_date)}
                      disabled={!isOnline || generating !== null}
                      className="text-xs text-blue-600 font-medium disabled:opacity-50"
                    >
                      {generating === visit.scheduled_date ? 'Creating…' : 'Create job'}
                    </button>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${VISIT_STATUS_CLASSES[visit.status]}`}>
                    {visit.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
