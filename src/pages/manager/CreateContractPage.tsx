import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { useAuth } from '../../auth/AuthProvider';
import { useSites } from '../../hooks/useSites';
import type { Contract, SystemType, VisitFrequency } from '../../types';

const SYSTEM_TYPE_OPTIONS: { value: SystemType; label: string }[] = [
  { value: 'fire_alarm', label: 'Fire Alarm' },
  { value: 'emergency_lighting', label: 'Emergency Lighting' },
  { value: 'cctv', label: 'CCTV' },
  { value: 'intruder', label: 'Intruder' },
  { value: 'access_control', label: 'Access Control' },
];

const FREQUENCY_OPTIONS: { value: VisitFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'biannual', label: 'Bi-annual' },
  { value: 'annual', label: 'Annual' },
];

export function CreateContractPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { sites } = useSites();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    site_id: '',
    reference: '',
    system_type: 'fire_alarm' as SystemType,
    visit_frequency: 'annual' as VisitFrequency,
    next_visit_due: '',
    notes: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.site_id) return;
    setSaving(true);
    const selectedSite = sites.find(s => s.id === form.site_id);
    const now = new Date().toISOString();
    const contract: Contract = {
      id: crypto.randomUUID(),
      company_id: profile.company_id,
      site_id: form.site_id,
      system_id: null,
      customer_id: selectedSite?.customer_id ?? '',
      reference: form.reference || null,
      system_type: form.system_type,
      visit_frequency: form.visit_frequency,
      next_visit_due: form.next_visit_due || null,
      status: 'active',
      notes: form.notes || null,
      created_at: now,
      updated_at: now,
    };
    await db.contracts.put(contract).catch(() => {});
    await supabase.from('contracts').insert(contract);
    setSaving(false);
    navigate(`/manager/contracts/${contract.id}`);
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate('/manager/contracts')} className="text-blue-600 text-sm mb-4 inline-block">
        ‹ Back
      </button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">New Contract</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Site <span className="text-red-500">*</span></label>
          <select
            required
            value={form.site_id}
            onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">— select site —</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.address}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
          <input
            type="text"
            value={form.reference}
            onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
            placeholder="e.g. FA-2024-001"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">System type <span className="text-red-500">*</span></label>
          <select
            required
            value={form.system_type}
            onChange={e => setForm(f => ({ ...f, system_type: e.target.value as SystemType }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            {SYSTEM_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Visit frequency <span className="text-red-500">*</span></label>
          <select
            required
            value={form.visit_frequency}
            onChange={e => setForm(f => ({ ...f, visit_frequency: e.target.value as VisitFrequency }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            {FREQUENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Next visit due</label>
          <input
            type="date"
            value={form.next_visit_due}
            onChange={e => setForm(f => ({ ...f, next_visit_due: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60"
        >
          {saving ? 'Creating…' : 'Create Contract'}
        </button>
      </form>
    </div>
  );
}
