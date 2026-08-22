// Supabase Edge Function: delete-account
//
// Actual account deletion requires the Supabase Auth admin API, which
// needs the service role key — not something a plain authenticated
// client can do itself, which is exactly why this has been a stub until
// now (see earlier handleDeleteUser). This is the real implementation:
// deletes the auth user (profiles cascades from that via FK) and marks
// the originating deletion request as completed.
//
// Deploy with: supabase functions deploy delete-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { requestId, targetUserId } = await req.json() as { requestId: string; targetUserId: string };
    if (!requestId || !targetUserId) return json({ error: 'Missing requestId or targetUserId.' }, 400);

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Confirm the caller is genuinely an admin — this is the one action
    // in the whole app that's irreversible, so it's checked directly
    // here rather than trusting RLS alone.
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return json({ error: 'Admin access required.' }, 403);
    }

    const { data: request, error: reqErr } = await admin.from('account_deletion_requests').select('*').eq('id', requestId).maybeSingle();
    if (reqErr || !request) return json({ error: `Deletion request not found: ${reqErr?.message ?? 'no such request'}` }, 404);
    if (request.profile_id !== targetUserId) return json({ error: 'targetUserId does not match this request.' }, 400);

    // Delete the profile row explicitly first, rather than assuming a
    // cascade from auth.users.id handles it — this way cleanup is
    // guaranteed regardless of how that foreign key is actually set up,
    // instead of potentially leaving an orphaned profile that still
    // shows up in Users lists, Discover, etc. after the auth account is
    // gone.
    const { error: profileDeleteErr } = await admin.from('profiles').delete().eq('id', targetUserId);
    if (profileDeleteErr) return json({ error: `Failed to delete profile: ${profileDeleteErr.message}` }, 500);

    const { error: deleteErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteErr) return json({ error: `Profile deleted, but failed to delete the auth account: ${deleteErr.message}` }, 500);

    await admin.from('account_deletion_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    }).eq('id', requestId);

    return json({ success: true });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
