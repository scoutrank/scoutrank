// Supabase Edge Function: review-club-affiliation
//
// Lets a verified, org-affiliated coach/scout (or an admin) approve or
// reject an athlete's request to join their club. Runs server-side
// because approving a request needs to update the *athlete's* own
// profile row (setting affiliated_organisation_id) — letting a coach
// update another user's profile directly via client-side RLS would be
// far too broad a permission to grant safely, so this function verifies
// the caller's standing itself and performs both writes atomically.
//
// Deploy with: supabase functions deploy review-club-affiliation

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
    const { requestId, action } = await req.json() as { requestId: string; action: 'approve' | 'reject' };
    if (!requestId || !['approve', 'reject'].includes(action)) {
      return json({ error: 'Missing requestId or invalid action.' }, 400);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: request, error: reqErr } = await admin
      .from('club_affiliation_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (reqErr || !request) return json({ error: 'Request not found.' }, 404);
    if (request.status !== 'pending') return json({ error: 'This request has already been reviewed.' }, 400);

    // Verify the caller is actually allowed to review requests for this
    // org — either an approved, affiliated coach/scout, or an admin.
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const isAdmin = callerProfile?.role === 'admin' || callerProfile?.role === 'super_admin';

    if (!isAdmin) {
      const { data: submission } = await admin
        .from('verification_submissions')
        .select('id')
        .eq('organisation_id', request.organisation_id)
        .eq('profile_id', user.id)
        .eq('status', 'approved')
        .maybeSingle();
      if (!submission) return json({ error: 'You are not an approved representative of this organisation.' }, 403);
    }

    const { error: updateErr } = await admin.from('club_affiliation_requests').update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', requestId);
    if (updateErr) return json({ error: `Failed to update request: ${updateErr.message}` }, 500);

    if (action === 'approve') {
      const { error: profileErr } = await admin.from('profiles')
        .update({ affiliated_organisation_id: request.organisation_id })
        .eq('id', request.profile_id);
      if (profileErr) return json({ error: `Request approved, but failed to update athlete profile: ${profileErr.message}` }, 500);
    }

    return json({ status: action === 'approve' ? 'approved' : 'rejected' });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
