import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { useAuth } from '../../auth/AuthProvider';
import { useCustomers } from '../../hooks/useCustomers';
import { useSites } from '../../hooks/useSites';
import { useSystems } from '../../hooks/useSystems';
import { useProfiles } from '../../hooks/useProfiles';
import type { Job, TemplateId, JobType } from '../../types';

const templateOptions: { value: TemplateId; label: string }[] = [
  { value: 'fire_alarm_service', label: 'Fire Alarm Service' },
  { value: 'reactive_callout', label: 'Reactive Callout' },
  { value: 'emergency_lighting_test', label: 'Emergency Lighting Test' },
  { value: 'cctv_maintenance', label: 'CCTV Maintenance' },
];

export function CreateJobPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { customers } = useCustomers();
  const { sites } = useSites();
  const { systems } = useSystems();
  const { profiles } = useProfiles({ role: 'engineer' });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_id: '', site_id: '', system_id: '',
    type: 'ppm_service' as JobType,
    template_id: 'fire_alarm_service' as TemplateId,
    assigned_engineer_id: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const filteredSites = form.customer_id ? sites.filter(s => s.customer_id === form.customer_id) : sites;
  const filteredSystems = form.site_id ? systems.filter(s => s.site_id === form.site_id) : systems;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const job: Job = {
      id: crypto.randomUUID(),
      company_id: profile.company_id,
      site_id: form.site_id,
      system_id: form.system_id || null,
      type: form.type,
      template_id: form.template_id,
      assigned_engineer_id: form.assigned_engineer_id || null,
      scheduled_date: form.scheduled_date,
      status: form.assigned_engineer_id ? 'scheduled' : 'unassigned',
      notes: form.notes || null,
      travelling_at: null,
      on_site_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    };
    await db.jobs.put(job).catch(() => {});
    await supabase.from('jobs').insert(job);
    setSaving(false);
    navigate('/manager/jobs');
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate('/manager/jobs')} className="text-blue-600 text-sm mb-4">‹ Back</button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">New Job</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer <span className="text-red-500">*</span></label>
          <select required value={form.customer_id} onChange={e => setForm(f => ({...f, customer_id: e.target.value, site_id: '', system_id: ''}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
            <option value="">— select —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Site <span className="text-red-500">*</span></label>
          <select required value={form.site_id} onChange={e => setForm(f => ({...f, site_id: e.target.value, system_id: ''}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
            <option value="">— select —</option>
            {filteredSites.map(s => <option key={s.id} value={s.id}>{s.address}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">System</label>
          <select value={form.system_id} onChange={e => setForm(f => ({...f, system_id: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
            <option value="">— none —</option>
            {filteredSystems.map(s => <option key={s.id} value={s.id}>{s.type.replace(/_/g, ' ')} — {s.make} {s.model}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Template <span className="text-red-500">*</span></label>
          <select required value={form.template_id} onChange={e => setForm(f => ({...f, template_id: e.target.value as TemplateId}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
            {templateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job type</label>
          <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value as JobType}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
            <option value="ppm_service">PPM Service</option>
            <option value="reactive_callout">Reactive Callout</option>
            <option value="install">Install</option>
            <option value="remedial_works">Remedial Works</option>
            <option value="survey">Survey</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled date <span className="text-red-500">*</span></label>
          <input required type="date" value={form.scheduled_date} onChange={e => setForm(f => ({...f, scheduled_date: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assign engineer</label>
          <select value={form.assigned_engineer_id} onChange={e => setForm(f => ({...f, assigned_engineer_id: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
            <option value="">— unassigned —</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none" />
        </div>
        <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60">
          {saving ? 'Creating…' : 'Create Job'}
        </button>
      </form>
    </div>
  );
}
