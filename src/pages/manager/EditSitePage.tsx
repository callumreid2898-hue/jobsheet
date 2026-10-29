import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchOneCached } from '../../lib/cachedQuery';
import { writeRecord } from '../../lib/writeRecord';
import { Input, Textarea } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import type { KeyholderEntry, Site } from '../../types';

type Form = {
  name: string; address: string; client_no: string; job_codes: string;
  contact_name: string; contact_phone: string; access_notes: string; hazards: string;
  arc_name: string; arc_account: string; police_urn: string;
};

const blankKeyholder = (): KeyholderEntry => ({ name: '', phone: '', order: 0 });

/** Edit a site, including the safety info engineers see on their job (hazards, keyholders, ARC). */
export function EditSitePage() {
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const [site, setSite] = useState<Site | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [keyholders, setKeyholders] = useState<KeyholderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    fetchOneCached<Site>('sites', siteId).then(s => {
      setSite(s);
      if (s) {
        setForm({
          name: s.name, address: s.address ?? '', client_no: s.client_no ?? '',
          job_codes: (s.job_codes ?? []).join(', '), contact_name: s.contact_name ?? '',
          contact_phone: s.contact_phone ?? '', access_notes: s.access_notes ?? '', hazards: s.hazards ?? '',
          arc_name: s.arc_name ?? '', arc_account: s.arc_account ?? '', police_urn: s.police_urn ?? '',
        });
        setKeyholders([...(s.keyholders ?? [])].sort((a, b) => a.order - b.order));
      }
      setLoading(false);
    });
  }, [siteId]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!site || !form) return <p className="text-center text-gray-400 py-12">Site not found</p>;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => f && ({ ...f, [k]: e.target.value }));

  function setKeyholder(i: number, patch: Partial<KeyholderEntry>) {
    setKeyholders(ks => ks.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  }

  function moveKeyholder(i: number, by: -1 | 1) {
    setKeyholders(ks => {
      const next = [...ks];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !site) return;
    setSaving(true);
    const text = (v: string) => v.trim() || null;
    const { status } = await writeRecord('sites', 'update', {
      id: site.id,
      name: form.name.trim(),
      address: form.address.trim(),
      client_no: text(form.client_no),
      job_codes: form.job_codes.split(',').map(c => c.trim()).filter(Boolean),
      contact_name: text(form.contact_name),
      contact_phone: text(form.contact_phone),
      access_notes: text(form.access_notes),
      hazards: text(form.hazards),
      arc_name: text(form.arc_name),
      arc_account: text(form.arc_account),
      police_urn: text(form.police_urn),
      // Called in list order
      keyholders: keyholders
        .filter(k => k.name.trim() || k.phone.trim())
        .map((k, i) => ({ name: k.name.trim(), phone: k.phone.trim(), order: i + 1 })),
    });
    setSaving(false);
    if (status !== 'failed') navigate(`/manager/sites/${site.id}`, { replace: true });
  }

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl">
      <button onClick={() => navigate(-1)} className="text-blue-600 text-sm mb-4 inline-block">‹ Back</button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Edit site</h1>

      <form onSubmit={handleSubmit}>
        <Input label="Site name" required value={form.name} onChange={set('name')} />
        <Input label="Address" value={form.address} onChange={set('address')} />
        <Input label="Client No" value={form.client_no} onChange={set('client_no')} hint="Filled in on this site's jobsheets." />
        <Input label="Job codes" value={form.job_codes} onChange={set('job_codes')} placeholder="e.g. FS1178, FS1178/4" hint="Separate with commas." />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Contact name" value={form.contact_name} onChange={set('contact_name')} />
          <Input label="Contact phone" type="tel" value={form.contact_phone} onChange={set('contact_phone')} />
        </div>
        <Textarea label="Access notes" value={form.access_notes} onChange={set('access_notes')} rows={2} />

        <h2 className="text-sm font-semibold text-gray-900 mt-6 mb-1">Safety and monitoring</h2>
        <p className="text-xs text-gray-500 mb-3">Engineers see these on every job at this site.</p>
        <Textarea label="Hazards" value={form.hazards} onChange={set('hazards')}
          placeholder="e.g. Asbestos in plant room ceiling; lone working not permitted" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="ARC name" value={form.arc_name} onChange={set('arc_name')} />
          <Input label="ARC account" value={form.arc_account} onChange={set('arc_account')} />
        </div>
        <Input label="Police URN" value={form.police_urn} onChange={set('police_urn')} />

        <fieldset className="mb-6">
          <legend className="text-sm font-medium text-gray-700 mb-2">Keyholders (in calling order)</legend>
          <ol className="space-y-2" data-testid="keyholders">
            {keyholders.map((k, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-5 text-xs text-gray-400 shrink-0">{i + 1}</span>
                <input
                  aria-label={`Keyholder ${i + 1} name`} value={k.name} placeholder="Name"
                  onChange={e => setKeyholder(i, { name: e.target.value })}
                  className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  aria-label={`Keyholder ${i + 1} phone`} value={k.phone} placeholder="Phone" type="tel"
                  onChange={e => setKeyholder(i, { phone: e.target.value })}
                  className="w-32 sm:w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <button type="button" aria-label={`Move keyholder ${i + 1} up`} disabled={i === 0}
                  onClick={() => moveKeyholder(i, -1)} className="text-gray-500 disabled:text-gray-200 px-1">↑</button>
                <button type="button" aria-label={`Remove keyholder ${i + 1}`}
                  onClick={() => setKeyholders(ks => ks.filter((_, j) => j !== i))} className="text-red-500 px-1">✕</button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setKeyholders(ks => [...ks, blankKeyholder()])}
            className="mt-2 text-sm font-medium text-blue-600">
            + Add keyholder
          </button>
        </fieldset>

        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60">
          {saving ? 'Saving…' : 'Save site'}
        </button>
      </form>
    </div>
  );
}
