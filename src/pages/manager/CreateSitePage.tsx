import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { useAuth } from '../../auth/AuthProvider';
import { useCustomers } from '../../hooks/useCustomers';
import type { Customer, Site, System, SystemType } from '../../types';

const systemTypes: { value: SystemType; label: string }[] = [
  { value: 'fire_alarm', label: 'Fire Alarm' },
  { value: 'emergency_lighting', label: 'Emergency Lighting' },
  { value: 'cctv', label: 'CCTV' },
  { value: 'intruder', label: 'Intruder' },
  { value: 'access_control', label: 'Access Control' },
];

export function CreateSitePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { customers } = useCustomers();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_id: '', new_customer_name: '',
    address: '', contact_name: '', contact_phone: '', access_notes: '',
    system_type: 'fire_alarm' as SystemType, system_make: '', system_model: '', panel_location: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    let customerId = form.customer_id;
    if (!customerId && form.new_customer_name) {
      const newCustomer: Customer = {
        id: crypto.randomUUID(), company_id: profile.company_id,
        name: form.new_customer_name, contact_name: null, contact_email: null, contact_phone: null,
        billing_address: null, notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.customers.put(newCustomer).catch(() => {});
      await supabase.from('customers').insert(newCustomer);
      customerId = newCustomer.id;
    }

    const site: Site = {
      id: crypto.randomUUID(), company_id: profile.company_id, customer_id: customerId,
      address: form.address, contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null, access_notes: form.access_notes || null,
      arc_name: null, arc_account: null, police_urn: null, hazards: null, keyholders: [],
      created_at: new Date().toISOString(),
    };
    await db.sites.put(site).catch(() => {});
    await supabase.from('sites').insert(site);

    if (form.system_type) {
      const system: System = {
        id: crypto.randomUUID(), site_id: site.id, company_id: profile.company_id,
        type: form.system_type, make: form.system_make || null, model: form.system_model || null,
        panel_location: form.panel_location || null, notes: null,
        zones_count: null, loops_count: null, num_cameras: null, retention_days: null, grade: null,
        created_at: new Date().toISOString(),
      };
      await db.systems.put(system).catch(() => {});
      await supabase.from('systems').insert(system);
    }

    setSaving(false);
    navigate('/manager/sites');
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <button onClick={() => navigate('/manager/sites')} className="text-blue-600 text-sm mb-4">‹ Back</button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">New Site</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
          <select value={form.customer_id} onChange={e => setForm(f => ({...f, customer_id: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 bg-white">
            <option value="">— new customer —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!form.customer_id && (
            <input required={!form.customer_id} type="text" value={form.new_customer_name} onChange={e => setForm(f => ({...f, new_customer_name: e.target.value}))} placeholder="New customer name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Site address <span className="text-red-500">*</span></label>
          <input required type="text" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact name</label>
            <input type="text" value={form.contact_name} onChange={e => setForm(f => ({...f, contact_name: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact phone</label>
            <input type="tel" value={form.contact_phone} onChange={e => setForm(f => ({...f, contact_phone: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Access notes</label>
          <textarea value={form.access_notes} onChange={e => setForm(f => ({...f, access_notes: e.target.value}))} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none" />
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">System</p>
          <select value={form.system_type} onChange={e => setForm(f => ({...f, system_type: e.target.value as SystemType}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3 bg-white">
            {systemTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Make</label>
              <input type="text" value={form.system_make} onChange={e => setForm(f => ({...f, system_make: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <input type="text" value={form.system_model} onChange={e => setForm(f => ({...f, system_model: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Panel location</label>
            <input type="text" value={form.panel_location} onChange={e => setForm(f => ({...f, panel_location: e.target.value}))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60">
          {saving ? 'Creating…' : 'Create Site'}
        </button>
      </form>
    </div>
  );
}
