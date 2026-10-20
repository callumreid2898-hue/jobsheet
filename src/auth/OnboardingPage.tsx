import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthProvider';

/**
 * Shown by AuthGuard to a signed-in user who can't use the app yet:
 *   none    → no profile and no invite: create a company (they become its manager)
 *   removed → a manager removed them
 *   offline → nothing cached on this device and no connection to check
 */
export function OnboardingPage() {
  const { access, session, signOut } = useAuth();
  const email = session?.user.email ?? '';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {access === 'removed' ? (
          <Message
            title="Your access has been removed"
            body="A manager removed you from the company, so this device's copy of its data has been cleared. If this is a mistake, ask a manager to restore you."
          />
        ) : access === 'offline' ? (
          <Message
            title="You're offline"
            body="This device hasn't signed you in before, so it needs a connection to check your account. Connect and the app will carry on."
          />
        ) : (
          <CreateCompany email={email} />
        )}
        <button onClick={signOut} className="mt-6 w-full text-sm text-slate-500 hover:text-slate-700">
          Sign out{email && ` (${email})`}
        </button>
      </div>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600 mt-2">{body}</p>
    </>
  );
}

function CreateCompany({ email }: { email: string }) {
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc('create_company_and_manager', {
      p_company_name: companyName, p_full_name: fullName,
    });
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    await refreshProfile();
    navigate('/manager/dashboard', { replace: true });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Set up your company</h1>
        <p className="text-sm text-slate-600 mt-1">
          You're signed in as {email}, but you're not part of a company yet. Create one and you'll be its manager.
          If you're expecting an invite from your employer, ask them to send it again instead.
        </p>
      </div>
      <div>
        <label htmlFor="company-name" className="block text-sm font-medium text-slate-700 mb-1">Company name</label>
        <input
          id="company-name"
          required
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="full-name" className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
        <input
          id="full-name"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button
        type="submit"
        disabled={saving || !navigator.onLine}
        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60"
      >
        {saving ? 'Creating…' : 'Create company'}
      </button>
    </form>
  );
}
