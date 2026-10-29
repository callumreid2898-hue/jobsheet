import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useOnline } from '../lib/useOnline';

const MIN_LENGTH = 8;

/** Set or change the signed-in user's password, so people who got in by email link can use one next time. */
export function SetPasswordForm() {
  const isOnline = useOnline();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    if (password.length < MIN_LENGTH) { setError(`Use at least ${MIN_LENGTH} characters.`); return; }
    if (password !== confirm) { setError("The passwords don't match."); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setPassword('');
    setConfirm('');
    setDone(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="Set password">
      <h2 className="text-sm font-semibold text-slate-900">Password</h2>
      <p className="text-xs text-slate-500">Set a password to sign in without waiting for an email link.</p>
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
        <input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p role="status" className="text-sm text-green-700">Password saved.</p>}
      {!isOnline && <p className="text-xs text-amber-700">You need to be online to change your password.</p>}
      <button
        type="submit"
        disabled={saving || !isOnline}
        className="w-full bg-white border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl text-sm disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}
