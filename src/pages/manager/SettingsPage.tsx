import { useState } from 'react';
import { writeRecord } from '../../lib/writeRecord';
import { useAuth } from '../../auth/AuthProvider';
import { SetPasswordForm } from '../../auth/SetPasswordForm';

export function SettingsPage() {
  const { company, profile } = useAuth();
  const [name, setName] = useState(company?.name ?? '');
  const [accreditation, setAccreditation] = useState(company?.accreditation_number ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !profile) return;
    setSaving(true);
    const { status } = await writeRecord('companies', 'update', { id: company.id, name, accreditation_number: accreditation });
    setSaving(false);
    if (status === 'saved') {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Settings</h1>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Accreditation number</label>
          <input type="text" value={accreditation} onChange={e => setAccreditation(e.target.value)} placeholder="e.g. NSI-NACOSS-12345" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
      <div className="mt-8 border-t border-gray-200 pt-4">
        <SetPasswordForm />
      </div>
    </div>
  );
}
