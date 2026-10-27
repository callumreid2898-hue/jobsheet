import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { writeRecords, type Write } from '../../lib/writeRecord';
import { localISODate } from '../../lib/dates';
import { useAuth } from '../../auth/AuthProvider';
import { useCustomers } from '../../hooks/useCustomers';
import { useSites } from '../../hooks/useSites';
import { useSystems } from '../../hooks/useSystems';
import { useProfiles } from '../../hooks/useProfiles';
import { useJobs } from '../../hooks/useJobs';
import { DEFAULT_DURATION_MINUTES, findClashes, fromMinutes, jobInterval } from '../../lib/planner';
import { TEMPLATE_OPTIONS } from '../../templates/labels';
import type { Job, TemplateId, JobType } from '../../types';

export function CreateJobPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { customers } = useCustomers();
  const { sites } = useSites();
  const { systems } = useSystems();
  const { profiles } = useProfiles({ role: 'engineer' });
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    customer_id: '',
    site_id: '',
    system_id: '',
    type: 'ppm_service' as JobType,
    template_id: 'fire_alarm_service' as TemplateId,
    assigned_engineer_id: searchParams.get('engineer') ?? '',
    scheduled_date: searchParams.get('date') ?? localISODate(),
    scheduled_time: searchParams.get('time') ?? '',
    duration_minutes: String(DEFAULT_DURATION_MINUTES),
    notes: '',
    call_no: '',
    client_no: '',
    reported_fault: '',
  });
  const { jobs: sameDayJobs } = useJobs({ date: form.scheduled_date || undefined });

  // Overlaps with the chosen engineer's other jobs that day
  const draft = {
    id: '',
    assigned_engineer_id: form.assigned_engineer_id || null,
    scheduled_date: form.scheduled_date,
    scheduled_time: form.scheduled_time || null,
    duration_minutes: Number(form.duration_minutes) || null,
  };
  const clashes = findClashes(draft, sameDayJobs);
  const clashText = clashes.map(j => {
    const [start, end] = jobInterval(j)!;
    return `${fromMinutes(start)}–${fromMinutes(end)}`;
  }).join(', ');

  const filteredSites = form.customer_id
    ? sites.filter(s => s.customer_id === form.customer_id)
    : sites;
  const filteredSystems = form.site_id
    ? systems.filter(s => s.site_id === form.site_id)
    : systems;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (clashes.length > 0 && !window.confirm(`This overlaps the engineer's other job${clashes.length > 1 ? 's' : ''} at ${clashText}. Create it anyway?`)) return;
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
      scheduled_time: form.scheduled_time || null,
      duration_minutes: Number(form.duration_minutes) || null,
      status: form.assigned_engineer_id ? 'scheduled' : 'unassigned',
      notes: form.notes || null,
      client_no: form.client_no.trim() || null,
      call_no: form.call_no.trim() || null,
      reported_fault: form.reported_fault.trim() || null,
      travelling_at: null,
      on_site_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    };
    const writes: Write[] = [{ table: 'jobs', op: 'insert', row: { ...job } }];
    // The first client no. given for a site becomes the site's, so later jobs get it
    const site = sites.find(s => s.id === form.site_id);
    if (site && !site.client_no && job.client_no) {
      writes.push({ table: 'sites', op: 'update', row: { id: site.id, client_no: job.client_no } });
    }
    await writeRecords(writes);
    setSaving(false);
    navigate('/manager/jobs');
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate(-1)} className="text-blue-600 text-sm mb-4">‹ Back</button>
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
          <select required value={form.site_id} onChange={e => { const siteId = e.target.value; setForm(f => ({...f, site_id: siteId, system_id: '', client_no: sites.find(s => s.id === siteId)?.client_no ?? ''})); }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
            <option value="">— select —</option>
            {filteredSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
            {TEMPLATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Date <span className="text-red-500">*</span></label>
            <input required type="date" value={form.scheduled_date} onChange={e => setForm(f => ({...f, scheduled_date: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
            <input type="time" value={form.scheduled_time} onChange={e => setForm(f => ({...f, scheduled_time: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="w-28">
            <label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label>
            <input type="number" min={15} step={15} value={form.duration_minutes} onChange={e => setForm(f => ({...f, duration_minutes: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="Duration in minutes" />
          </div>
        </div>
        {clashes.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="alert">
            Overlaps this engineer's other job{clashes.length > 1 ? 's' : ''} at {clashText}.
          </p>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assign engineer</label>
          <select value={form.assigned_engineer_id} onChange={e => setForm(f => ({...f, assigned_engineer_id: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
            <option value="">— unassigned —</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Call No</label>
            <input type="text" value={form.call_no} onChange={e => setForm(f => ({...f, call_no: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Client No</label>
            <input type="text" value={form.client_no} onChange={e => setForm(f => ({...f, client_no: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reported fault</label>
          <textarea value={form.reported_fault} onChange={e => setForm(f => ({...f, reported_fault: e.target.value}))} rows={3} placeholder="Optional — the engineer can edit it on the jobsheet" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none" />
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
