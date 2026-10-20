import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { writeRecord } from '../../lib/writeRecord';
import { useAuth } from '../../auth/AuthProvider';
import type { Device } from '../../types';

export function AddDevicePage() {
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: '',
    location: '',
    make: '',
    model: '',
    serial_number: '',
    install_date: '',
    notes: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !siteId) return;
    setSaving(true);
    const device: Device = {
      id: crypto.randomUUID(),
      site_id: siteId,
      company_id: profile.company_id,
      system_id: null,
      type: form.type,
      location: form.location || null,
      make: form.make || null,
      model: form.model || null,
      serial_number: form.serial_number || null,
      install_date: form.install_date || null,
      qr_code: crypto.randomUUID(),
      notes: form.notes || null,
      created_at: new Date().toISOString(),
    };
    await writeRecord('devices', 'insert', { ...device });
    setSaving(false);
    navigate(`/manager/sites/${siteId}/devices/${device.id}`);
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <button
        onClick={() => navigate(`/manager/sites/${siteId}/devices`)}
        className="text-blue-600 text-sm mb-4 inline-block"
      >
        ‹ Back
      </button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Add Device</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="text"
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            placeholder="e.g. smoke_detector, heat_detector, call_point, camera, panel"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input
            type="text"
            value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            placeholder="e.g. Zone 1 - Reception"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Make</label>
            <input
              type="text"
              value={form.make}
              onChange={e => setForm(f => ({ ...f, make: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <input
              type="text"
              value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
          <input
            type="text"
            value={form.serial_number}
            onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Install Date</label>
          <input
            type="date"
            value={form.install_date}
            onChange={e => setForm(f => ({ ...f, install_date: e.target.value }))}
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
          {saving ? 'Saving…' : 'Add Device'}
        </button>
      </form>
    </div>
  );
}
