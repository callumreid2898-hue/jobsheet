import { useEffect, useState } from 'react';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import { fetchCached } from '../../lib/cachedQuery';
import { useOnline } from '../../lib/useOnline';
import { showToast } from '../../lib/toast';
import { formatUKDate } from '../../lib/dates';
import { useAuth } from '../../auth/AuthProvider';
import { useProfiles } from '../../hooks/useProfiles';
import { Spinner } from '../../components/ui/Spinner';
import type { Profile, UserRole } from '../../types';

interface Invite {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  expires_at: string;
  accepted_at: string | null;
}

/** Why a function call failed, from its JSON body where there is one. */
async function functionError(error: unknown): Promise<{ missing: boolean; message: string }> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const body = await res.json().catch(() => ({})) as { error?: string };
    return { missing: res.status === 404, message: body.error ?? `HTTP ${res.status}` };
  }
  return { missing: error instanceof FunctionsFetchError, message: error instanceof Error ? error.message : String(error) };
}

/**
 * Team management needs a connection: invites, role changes and removals are
 * checked by the server (RPCs from 00013) rather than queued.
 */
export function TeamPage() {
  const { profile: me, company } = useAuth();
  const isOnline = useOnline();
  const { profiles, isLoading, refetch } = useProfiles({ includeInactive: true });
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('engineer');
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  async function loadInvites() {
    const { rows } = await fetchCached<Invite>({ table: 'invites', order: { column: 'expires_at' } });
    setInvites(rows.filter(i => !i.accepted_at));
  }
  useEffect(() => { loadInvites(); }, []);

  async function run(key: string, action: () => PromiseLike<{ error: { message: string } | null }>, done?: string) {
    setBusy(key);
    const { error } = await action();
    setBusy(null);
    if (error) {
      showToast(error.message, 'error', 8000);
      return false;
    }
    if (done) showToast(done, 'success');
    await refetch();
    return true;
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setBusy('invite');
    setInviteNote(null);
    const body = { email, role, full_name: fullName, redirect_to: `${window.location.origin}/auth/callback` };
    const { data, error } = await supabase.functions.invoke('invite-user', { body });

    if (error) {
      const why = await functionError(error);
      if (!why.missing) {
        setBusy(null);
        showToast(why.message, 'error', 8000);
        return;
      }
      // The invite-user function isn't deployed: save the invite; the login is sent from the dashboard
      const { error: insertError } = await supabase.from('invites').insert({
        company_id: company.id, email: email.trim().toLowerCase(), role, full_name: fullName.trim() || null, invited_by: me?.id,
      });
      setBusy(null);
      if (insertError && insertError.code !== '23505') {
        showToast(insertError.message, 'error', 8000);
        return;
      }
      setInviteNote(`Invite saved, but the invite email couldn't be sent (the invite-user function isn't deployed). Send ${email} a login from the Supabase dashboard: Authentication → Users → Invite user. They'll join ${company.name} when they first sign in.`);
    } else {
      setBusy(null);
      setInviteNote((data as { status?: string })?.status === 'existing_user'
        ? `${email} already has a login. They'll join ${company.name} next time they sign in.`
        : `Invite sent to ${email}.`);
    }
    setEmail('');
    setFullName('');
    await loadInvites();
  }

  async function remove(p: Profile) {
    if (!window.confirm(`Remove ${p.full_name}? They'll lose access straight away, and their jobs that haven't been submitted go back to Unassigned. Changes not yet synced from their device will be lost.`)) return;
    setBusy(p.id);
    const { data, error } = await supabase.rpc('remove_member', { p_profile_id: p.id });
    setBusy(null);
    if (error) { showToast(error.message, 'error', 8000); return; }
    const n = data as number;
    showToast(`${p.full_name} removed.${n > 0 ? ` ${n} job${n !== 1 ? 's are' : ' is'} back in Unassigned on the planner.` : ''}`, 'success', 8000);
    await refetch();
  }

  const members = [...profiles].sort((a, b) => Number(b.active !== false) - Number(a.active !== false));

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Team</h1>
        <p className="text-sm text-slate-500 mt-0.5">Invite engineers and managers, change roles, or remove people.</p>
      </div>

      {!isOnline && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          You're offline. Team changes need a connection.
        </p>
      )}

      <form onSubmit={invite} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Invite someone</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Email"
          />
          <input
            placeholder="Name (optional)" value={fullName} onChange={e => setFullName(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Name"
          />
          <select
            value={role} onChange={e => setRole(e.target.value as UserRole)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" aria-label="Role"
          >
            <option value="engineer">Engineer</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <button
          type="submit" disabled={!isOnline || busy === 'invite'}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60"
        >
          {busy === 'invite' ? 'Sending…' : 'Send invite'}
        </button>
        {inviteNote && <p className="text-sm text-slate-700" role="status">{inviteNote}</p>}
      </form>

      {invites.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 px-4 pt-4">Pending invites</h2>
          <ul className="divide-y divide-slate-100">
            {invites.map(i => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 truncate">{i.full_name ? `${i.full_name} · ` : ''}{i.email}</p>
                  <p className="text-xs text-slate-500 capitalize">
                    {i.role} · {Date.parse(i.expires_at) < Date.now() ? 'expired' : `expires ${formatUKDate(i.expires_at)}`}
                  </p>
                </div>
                <button
                  disabled={!isOnline || busy === i.id}
                  onClick={async () => {
                    if (await run(i.id, () => supabase.from('invites').delete().eq('id', i.id), 'Invite cancelled.')) await loadInvites();
                  }}
                  className="text-xs text-red-600 disabled:opacity-50"
                >
                  Cancel invite
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 px-4 pt-4">Members</h2>
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="team-members">
            {members.map(p => {
              const active = p.active !== false;
              const isMe = p.id === me?.id;
              return (
                <li key={p.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${active ? '' : 'opacity-60'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {p.full_name}{isMe && ' (you)'}
                      {!active && <span className="ml-2 text-xs font-normal text-red-600">Removed</span>}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{p.email}</p>
                  </div>
                  <select
                    value={p.role}
                    disabled={!isOnline || !active || busy === p.id}
                    onChange={e => run(p.id, () => supabase.rpc('set_member_role', { p_profile_id: p.id, p_role: e.target.value }), 'Role updated.')}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white disabled:opacity-60"
                    aria-label={`Role for ${p.full_name}`}
                  >
                    <option value="engineer">Engineer</option>
                    <option value="manager">Manager</option>
                  </select>
                  {active ? (
                    !isMe && (
                      <button
                        onClick={() => remove(p)} disabled={!isOnline || busy === p.id}
                        className="text-xs text-red-600 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => run(p.id, () => supabase.rpc('restore_member', { p_profile_id: p.id }), `${p.full_name} restored.`)}
                      disabled={!isOnline || busy === p.id}
                      className="text-xs text-blue-600 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
