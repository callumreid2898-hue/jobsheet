// invite-user: a manager invites someone to their company.
//
//   POST { email, role: 'engineer' | 'manager', full_name?, redirect_to }
//   → { status: 'invited' }        new login created, Supabase's invite email sent
//   → { status: 'existing_user' }  they already have a login; they just sign in
//                                  and the app claims the invite (claim_invite())
//
// The invite row is written with the caller's own JWT, so RLS (manager of this
// company) decides whether they may invite at all. Only creating the auth
// account uses the service role. Deploy: `supabase functions deploy invite-user`.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return reply(401, { error: 'Not signed in' });

  let body: { email?: string; role?: string; full_name?: string; redirect_to?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid JSON' });
  }
  const email = (body.email ?? '').trim().toLowerCase();
  const role = body.role ?? 'engineer';
  if (!EMAIL.test(email)) return reply(400, { error: 'Enter a valid email address' });
  if (role !== 'engineer' && role !== 'manager') return reply(400, { error: 'Role must be engineer or manager' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const [{ data: myRole }, { data: companyId }, { data: profileId }] = await Promise.all([
    asCaller.rpc('get_my_role'),
    asCaller.rpc('get_my_company_id'),
    asCaller.rpc('get_my_profile_id'),
  ]);
  if (myRole !== 'manager' || !companyId) return reply(403, { error: 'Only managers can invite people' });

  // A pending invite for this email already exists (unique index): treat as "send again"
  const { error: inviteError } = await asCaller.from('invites').insert({
    company_id: companyId, email, role, full_name: body.full_name?.trim() || null, invited_by: profileId,
  });
  if (inviteError && inviteError.code !== '23505') return reply(400, { error: inviteError.message });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: body.redirect_to });
  if (error) {
    if (/already (been )?registered|already exists/i.test(error.message)) return reply(200, { status: 'existing_user' });
    return reply(502, { error: error.message });
  }
  return reply(200, { status: 'invited' });
});
