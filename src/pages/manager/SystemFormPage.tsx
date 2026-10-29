import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchOneCached } from '../../lib/cachedQuery';
import { writeRecord } from '../../lib/writeRecord';
import { SYSTEM_TYPE_LABELS } from '../../lib/contracts';
import { useAuth } from '../../auth/AuthProvider';
import { Input, Textarea } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import type { System, SystemType } from '../../types';

const EMPTY = {
  type: 'fire_alarm' as SystemType, make: '', model: '', panel_location: '', zones_count: '', loops_count: '',
  num_cameras: '', retention_days: '', grade: '', notes: '',
};

const num = (v: string) => (v.trim() === '' ? null : Number(v));
const str = (v: number | null) => (v == null ? '' : String(v));

/** Add a system to a site (/manager/sites/:siteId/systems/new) or edit one (/manager/systems/:systemId/edit). */
export function SystemFormPage() {
  const navigate = useNavigate();
  const params = useParams<{ siteId?: string; systemId?: string }>();
  const { profile } = useAuth();
  const [existing, setExisting] = useState<System | null>(null);
  const [loading, setLoading] = useState(!!params.systemId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!params.systemId) return;
    fetchOneCached<System>('systems', params.systemId).then(s => {
      setExisting(s);
      if (s) {
        setForm({
          type: s.type, make: s.make ?? '', model: s.model ?? '', panel_location: s.panel_location ?? '',
          zones_count: str(s.zones_count), loops_count: str(s.loops_count), num_cameras: str(s.num_cameras),
          retention_days: str(s.retention_days), grade: s.grade ?? '', notes: s.notes ?? '',
        });
      }
      setLoading(false);
    });
  }, [params.systemId]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const siteId = existing?.site_id ?? params.siteId;
    if (!profile || !siteId) return;
    setSaving(true);
    const fields = {
      type: form.type,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      panel_location: form.panel_location.trim() || null,
      zones_count: num(form.zones_count),
      loops_count: num(form.loops_count),
      num_cameras: num(form.num_cameras),
      retention_days: num(form.retention_days),
      grade: form.grade.trim() || null,
      notes: form.notes.trim() || null,
    };
    let id: string;
    if (existing) {
      id = existing.id;
      await writeRecord('systems', 'update', { id, ...fields });
    } else {
      const system: System = {
        id: crypto.randomUUID(), site_id: siteId, company_id: profile.company_id,
        created_at: new Date().toISOString(), ...fields,
      };
      id = system.id;
      await writeRecord('systems', 'insert', { ...system });
    }
    setSaving(false);
    navigate(`/manager/systems/${id}`, { replace: true });
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (params.systemId && !existing) return <p className="text-center text-gray-400 py-12">System not found</p>;

  const isCctv = form.type === 'cctv';
  const isFire = form.type === 'fire_alarm';

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl">
      <button onClick={() => navigate(-1)} className="text-blue-600 text-sm mb-4 inline-block">‹ Back</button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">{existing ? 'Edit system' : 'Add system'}</h1>

      <form onSubmit={handleSubmit}>
        <Select label="Type" required value={form.type} onChange={set('type')}
          options={Object.entries(SYSTEM_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Make" value={form.make} onChange={set('make')} />
          <Input label="Model" value={form.model} onChange={set('model')} />
        </div>
        <Input label="Panel location" value={form.panel_location} onChange={set('panel_location')} />
        {isFire && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Zones" type="number" min={0} value={form.zones_count} onChange={set('zones_count')} />
            <Input label="Loops" type="number" min={0} value={form.loops_count} onChange={set('loops_count')} />
          </div>
        )}
        {isCctv && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cameras" type="number" min={0} value={form.num_cameras} onChange={set('num_cameras')} />
            <Input label="Retention (days)" type="number" min={0} value={form.retention_days} onChange={set('retention_days')} />
          </div>
        )}
        <Input label="Grade" value={form.grade} onChange={set('grade')} placeholder="e.g. L2, Grade 2" />
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} />
        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60">
          {saving ? 'Saving…' : existing ? 'Save system' : 'Add system'}
        </button>
      </form>
    </div>
  );
}
