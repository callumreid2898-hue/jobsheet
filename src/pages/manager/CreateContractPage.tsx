import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { writeRecord } from '../../lib/writeRecord';
import { fetchOneCached } from '../../lib/cachedQuery';
import { FREQUENCY_LABELS, SYSTEM_TYPE_LABELS } from '../../lib/contracts';
import { useAuth } from '../../auth/AuthProvider';
import { useSites } from '../../hooks/useSites';
import { useSystems } from '../../hooks/useSystems';
import { Spinner } from '../../components/ui/Spinner';
import type { Contract, SystemType, VisitFrequency } from '../../types';

const SYSTEM_TYPES = Object.keys(SYSTEM_TYPE_LABELS) as SystemType[];
const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as VisitFrequency[];

const EMPTY = {
  site_id: '',
  system_id: '',
  reference: '',
  system_type: 'fire_alarm' as SystemType,
  visit_frequency: 'annual' as VisitFrequency,
  start_date: '',
  end_date: '',
  next_visit_due: '',
  notes: '',
};

/** New contract, or edit one at /manager/contracts/:contractId/edit. */
export function CreateContractPage() {
  const navigate = useNavigate();
  const { contractId } = useParams<{ contractId: string }>();
  const isEdit = !!contractId;
  const { profile } = useAuth();
  const { sites } = useSites();
  const [existing, setExisting] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const { systems } = useSystems(form.site_id || undefined);

  useEffect(() => {
    if (!contractId) return;
    fetchOneCached<Contract>('contracts', contractId).then(c => {
      setExisting(c);
      if (c) {
        setForm({
          site_id: c.site_id,
          system_id: c.system_id ?? '',
          reference: c.reference ?? '',
          system_type: c.system_type,
          visit_frequency: c.visit_frequency,
          start_date: c.start_date ?? '',
          end_date: c.end_date ?? '',
          next_visit_due: c.next_visit_due ?? '',
          notes: c.notes ?? '',
        });
      }
      setLoading(false);
    });
  }, [contractId]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm(f => ({ ...f, [key]: value }));

  function pickSystem(systemId: string) {
    const system = systems.find(s => s.id === systemId);
    // The contract covers that system, so it takes its type
    setForm(f => ({ ...f, system_id: systemId, system_type: system?.type ?? f.system_type }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    const site = sites.find(s => s.id === form.site_id);
    if (!site?.customer_id) {
      setError("Pick a site that belongs to a customer: the contract's customer comes from its site.");
      return;
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('The end date is before the start date.');
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const fields = {
      site_id: form.site_id,
      system_id: form.system_id || null,
      customer_id: site.customer_id,
      reference: form.reference.trim() || null,
      system_type: form.system_type,
      visit_frequency: form.visit_frequency,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      // The first visit defaults to the start date
      next_visit_due: form.next_visit_due || form.start_date || null,
      notes: form.notes.trim() || null,
      updated_at: now,
    };

    if (existing) {
      await writeRecord('contracts', 'update', { id: existing.id, ...fields });
      setSaving(false);
      navigate(`/manager/contracts/${existing.id}`);
      return;
    }
    const contract: Contract = {
      id: crypto.randomUUID(), company_id: profile.company_id, status: 'active', created_at: now, ...fields,
    };
    await writeRecord('contracts', 'insert', { ...contract });
    setSaving(false);
    navigate(`/manager/contracts/${contract.id}`);
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (isEdit && !existing) return <p className="text-center py-12 text-gray-400">Contract not found.</p>;

  const siteSystems = systems.filter(s => s.site_id === form.site_id);
  const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

  return (
    <div className="px-4 pt-6 pb-6">
      <button
        onClick={() => navigate(existing ? `/manager/contracts/${existing.id}` : '/manager/contracts')}
        className="text-blue-600 text-sm mb-4 inline-block"
      >
        ‹ Back
      </button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">{isEdit ? 'Edit Contract' : 'New Contract'}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="c-site" className="block text-sm font-medium text-gray-700 mb-1">Site <span className="text-red-500">*</span></label>
          <select
            id="c-site" required value={form.site_id} disabled={isEdit}
            onChange={e => setForm(f => ({ ...f, site_id: e.target.value, system_id: '' }))}
            className={`${input} bg-white disabled:bg-gray-50`}
          >
            <option value="">— select site —</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="c-system" className="block text-sm font-medium text-gray-700 mb-1">System</label>
          <select
            id="c-system" value={form.system_id} disabled={!form.site_id}
            onChange={e => pickSystem(e.target.value)}
            className={`${input} bg-white disabled:bg-gray-50`}
          >
            <option value="">{siteSystems.length ? '— whole site / not specific —' : 'No systems recorded at this site'}</option>
            {siteSystems.map(s => (
              <option key={s.id} value={s.id}>
                {SYSTEM_TYPE_LABELS[s.type]}{s.make ? ` · ${s.make}` : ''}{s.panel_location ? ` · ${s.panel_location}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="c-type" className="block text-sm font-medium text-gray-700 mb-1">System type <span className="text-red-500">*</span></label>
          <select
            id="c-type" required value={form.system_type} disabled={!!form.system_id}
            onChange={e => set('system_type', e.target.value as SystemType)}
            className={`${input} bg-white disabled:bg-gray-50`}
          >
            {SYSTEM_TYPES.map(t => <option key={t} value={t}>{SYSTEM_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="c-ref" className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
          <input id="c-ref" type="text" value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="e.g. FA-2024-001" className={input} />
        </div>

        <div>
          <label htmlFor="c-freq" className="block text-sm font-medium text-gray-700 mb-1">Visit frequency <span className="text-red-500">*</span></label>
          <select
            id="c-freq" required value={form.visit_frequency}
            onChange={e => set('visit_frequency', e.target.value as VisitFrequency)}
            className={`${input} bg-white`}
          >
            {FREQUENCIES.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="c-start" className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
            <input id="c-start" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={input} />
          </div>
          <div className="flex-1">
            <label htmlFor="c-end" className="block text-sm font-medium text-gray-700 mb-1">End date</label>
            <input id="c-end" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={input} />
          </div>
        </div>

        <div>
          <label htmlFor="c-next" className="block text-sm font-medium text-gray-700 mb-1">Next visit due</label>
          <input id="c-next" type="date" value={form.next_visit_due} onChange={e => set('next_visit_due', e.target.value)} className={input} />
          <p className="text-xs text-gray-500 mt-1">
            Leave blank to use the start date. After each visit's job is completed it moves on by the frequency.
          </p>
        </div>

        <div>
          <label htmlFor="c-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea id="c-notes" value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={`${input} resize-none`} />
        </div>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create Contract'}
        </button>
      </form>
    </div>
  );
}
