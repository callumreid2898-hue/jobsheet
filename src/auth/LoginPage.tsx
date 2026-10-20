import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      // Invite-only: never create an account from the login form.
      options: { emailRedirectTo: window.location.origin + '/auth/callback', shouldCreateUser: false },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#0D3349] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">🔒</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0D3349]">GuardianFSM</h1>
          <p className="text-slate-500 mt-1 text-sm">Field service, built for fire &amp; security.</p>
        </div>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <div className="text-3xl mb-3">📧</div>
            <h2 className="font-semibold text-green-800 mb-1">Check your email</h2>
            <p className="text-green-700 text-sm">We sent a sign-in link to <strong>{email}</strong></p>
            <button onClick={() => setSent(false)} className="mt-4 text-sm text-green-600 underline">
              Try a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]"
              />
            </div>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0D3349] text-white font-semibold py-3 rounded-xl text-base hover:bg-[#0f3d57] active:bg-[#0D3349] disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
