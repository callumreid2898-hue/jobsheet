import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchOneCached } from '../../lib/cachedQuery';
import { writeRecord } from '../../lib/writeRecord';
import { DEVICE_TYPES, formatDeviceType } from '../../lib/devices';
import { SYSTEM_TYPE_LABELS } from '../../lib/contracts';
import { useAuth } from '../../auth/AuthProvider';
import { useSystems } from '../../hooks/useSystems';
import { Input, Textarea } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import type { Device, DeviceStatus } from '../../types';

const EMPTY = {
  type: '', system_id: '', location: '', make: '', model: '', serial_number: '', install_date: '', notes: '',
  status: 'active' as DeviceStatus,
};

/** Add a device to a site (/manager/sites/:siteId/devices/add) or edit one (/devices/:deviceId/edit). */
export function DeviceFormPage() {
  const navigate = useNavigate();
  const params = useParams<{ siteId?: string; deviceId?: string }>();
  const { profile } = useAuth();
  const [existing, setExisting] = useState<Device | null>(null);
  const [loading, setLoading] = useState(!!params.deviceId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const siteId = existing?.site_id ?? params.siteId;
  const { systems } = useSystems(siteId);

  useEffect(() => {
    if (!params.deviceId) return;
    fetchOneCached<Device>('devices', params.deviceId).then(d => {
      setExisting(d);
      if (d) {
        setForm({
          type: d.type, system_id: d.system_id ?? '', location: d.location ?? '', make: d.make ?? '',
          model: d.model ?? '', serial_number: d.serial_number ?? '', install_date: d.install_date ?? '',
          notes: d.notes ?? '', status: d.status ?? 'active',
        });
      }
      setLoading(false);
    });
  }, [params.deviceId]);

  // A site with one system: new devices go on it
  useEffect(() => {
    if (!existing && systems.length === 1 && !form.system_id) setForm(f => ({ ...f, system_id: systems[0].id }));
  }, [systems]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !siteId) return;
    setSaving(true);
    const fields = {
      type: form.type.trim().toLowerCase().replace(/\s+/g, '_'),
      system_id: form.system_id || null,
      location: form.location.trim() || null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      install_date: form.install_date || null,
      notes: form.notes.trim() || null,
      status: form.status,
    };
    let id: string;
    if (existing) {
      id = existing.id;
      await writeRecord('devices', 'update', { id, ...fields });
    } else {
      const device: Device = {
        id: crypto.randomUUID(), site_id: siteId, company_id: profile.company_id,
        qr_code: crypto.randomUUID(), created_at: new Date().toISOString(), ...fields,
      };
      id = device.id;
      await writeRecord('devices', 'insert', { ...device });
    }
    setSaving(false);
    navigate(`/devices/${id}`, { replace: !!existing });
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (params.deviceId && !existing) return <p className="text-center text-gray-400 py-12">Device not found</p>;

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl">
      <button onClick={() => navigate(-1)} className="text-blue-600 text-sm mb-4 inline-block">‹ Back</button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">{existing ? 'Edit device' : 'Add device'}</h1>

      <form onSubmit={handleSubmit}>
        <Input label="Type" required list="device-types" value={form.type} onChange={set('type')}
          placeholder="e.g. smoke detector" hint="Pick one or type your own." />
        <datalist id="device-types">
          {DEVICE_TYPES.map(t => <option key={t} value={t}>{formatDeviceType(t)}</option>)}
        </datalist>
        <Select
          label="System"
          value={form.system_id}
          onChange={set('system_id')}
          placeholder="Not linked to a system"
          options={systems.map(s => ({
            value: s.id,
            label: [SYSTEM_TYPE_LABELS[s.type] ?? s.type, s.make, s.model].filter(Boolean).join(' · '),
          }))}
        />
        <Input label="Location" value={form.location} onChange={set('location')} placeholder="e.g. Zone 1 - Reception" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Make" value={form.make} onChange={set('make')} />
          <Input label="Model" value={form.model} onChange={set('model')} />
        </div>
        <Input label="Serial number" value={form.serial_number} onChange={set('serial_number')} />
        <Input label="Install date" type="date" value={form.install_date} onChange={set('install_date')} />
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} />
        {existing && (
          <Select
            label="Status"
            value={form.status}
            onChange={set('status')}
            hint="Removed devices keep their history but aren't on service sheets or counted in coverage."
            options={[{ value: 'active', label: 'Active' }, { value: 'removed', label: 'Removed from site' }]}
          />
        )}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60"
        >
          {saving ? 'Saving…' : existing ? 'Save device' : 'Add device'}
        </button>
      </form>
    </div>
  );
}
