import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { useProfiles } from '../../hooks/useProfiles';
import type { Job } from '../../types';

export function AssignEngineerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { profiles } = useProfiles({ role: 'engineer' });
  const [job, setJob] = useState<Job | null>(null);
  const [selectedEngineer, setSelectedEngineer] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    db.jobs.get(jobId).then(j => {
      if (j) { setJob(j); setSelectedEngineer(j.assigned_engineer_id ?? ''); }
    }).catch(() => {});
  }, [jobId]);

  async function handleAssign() {
    if (!job) return;
    setSaving(true);
    const updated: Job = { ...job, assigned_engineer_id: selectedEngineer || null };
    await db.jobs.put(updated);
    await supabase.from('jobs').update({ assigned_engineer_id: selectedEngineer || null }).eq('id', job.id);
    setSaving(false);
    navigate('/manager/jobs');
  }

  return (
    <div className="px-4 pt-6">
      <button onClick={() => navigate('/manager/jobs')} className="text-blue-600 text-sm mb-4">‹ Back</button>
      <h1 className="text-xl font-bold mb-4">Assign Engineer</h1>
      <select value={selectedEngineer} onChange={e => setSelectedEngineer(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4 bg-white">
        <option value="">— unassigned —</option>
        {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
      <button onClick={handleAssign} disabled={saving} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60">
        {saving ? 'Saving…' : 'Save Assignment'}
      </button>
    </div>
  );
}
