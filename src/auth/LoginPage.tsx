import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthProvider';

const inputClass = 'w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D3349]';
const buttonClass = 'w-full bg-[#0D3349] text-white font-semibold py-3 rounded-xl text-base hover:bg-[#0f3d57] active:bg-[#0D3349] disabled:opacity-60';

export function LoginPage() {
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function switchMode(to: 'password' | 'link') {
    setMode(to);
    setError('');
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setLoading(false);
      setError(err.message === 'Invalid login credentials'
        ? "Wrong email or password. If you haven't set a password yet, use a sign-in link."
        : err.message);
      return;
    }
    // The auth event has started loading the profile; wait so the callback routes by role
    await refreshProfile().catch(() => {});
    navigate('/auth/callback', { replace: true });
  }

  async function handleLink(e: React.FormEvent) {
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

  const emailField = (
    <div className="mb-4">
      <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
      <input
        id="login-email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="you@example.com"
        className={inputClass}
      />
    </div>
  );

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
        ) : mode === 'password' ? (
          <form onSubmit={handlePassword} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            {emailField}
            <div className="mb-4">
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => switchMode('link')} className="w-full mt-4 text-sm text-slate-600 underline">
              Email me a sign-in link instead
            </button>
          </form>
        ) : (
          <form onSubmit={handleLink} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            {emailField}
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
            <p className="text-xs text-slate-500 mt-3 text-center">
              Forgotten your password? Sign in with a link, then set a new one.
            </p>
            <button type="button" onClick={() => switchMode('password')} className="w-full mt-3 text-sm text-slate-600 underline">
              Sign in with a password instead
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
