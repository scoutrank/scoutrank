// Supabase Edge Function: review-organisation-claim
//
// Admin approval for both "Claim an existing unclaimed club" and
// "Register a brand new club" applications. Runs server-side because
// approval needs to (for a new registration) create the organisation
// row itself and then grant the claimant 'owner' staff status — two
// writes that need to happen together, performed with the service
// role rather than relying on a client-side multi-step flow that could
// leave things half-done if interrupted.
//
// Deploy with: supabase functions deploy review-organisation-claim

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
    const { claimId, action, rejectionReason } = await req.json() as { claimId: string; action: 'approve' | 'reject'; rejectionReason?: string };
    if (!claimId || !['approve', 'reject'].includes(action)) {
      return json({ error: 'Missing claimId or invalid action.' }, 400);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const isAdmin = callerProfile?.role === 'admin' || callerProfile?.role === 'super_admin';
    if (!isAdmin) return json({ error: 'Admin access required.' }, 403);

    const { data: claim, error: claimErr } = await admin.from('organisation_claims').select('*').eq('id', claimId).maybeSingle();
    if (claimErr || !claim) { console.error('[review-organisation-claim] Failed to load claim:', claimErr?.message); return json({ error: 'Claim not found.' }, 404); }
    if (claim.status !== 'pending') return json({ error: 'This claim has already been reviewed.' }, 400);

    if (action === 'reject') {
      const { error } = await admin.from('organisation_claims').update({
        status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason ?? null,
      }).eq('id', claimId);
      if (error) { console.error('[review-organisation-claim] Failed to reject:', error.message); return json({ error: error.message }, 500); }
      return json({ status: 'rejected' });
    }

    // Approve — for a new registration, create the organisation first;
    // for a claim, the organisation already exists.
    let organisationId = claim.organisation_id as string | null;

    if (claim.claim_type === 'register') {
      const { data: newOrg, error: orgErr } = await admin.from('organisations').insert({
        name: claim.new_org_name,
        type: claim.new_org_type,
        sports: claim.new_org_sports,
        country: claim.new_org_country,
        state: claim.new_org_state,
        city: claim.new_org_city,
        website: claim.new_org_website,
        official_email: claim.official_email,
        verified: true,
        is_active: true,
      }).select('id').single();
      if (orgErr || !newOrg) {
        console.error('[review-organisation-claim] Failed to create organisation:', orgErr?.message, orgErr?.details, orgErr?.hint);
        return json({ error: `Failed to create organisation: ${orgErr?.message}` }, 500);
      }
      organisationId = newOrg.id;
    }

    if (!organisationId) { console.error('[review-organisation-claim] No organisationId after processing.'); return json({ error: 'No organisation to link this claim to.' }, 500); }

    // Check they're not already staff (idempotency — an admin re-clicking
    // Approve shouldn't error out on the unique constraint).
    const { data: existingStaff } = await admin.from('organisation_staff')
      .select('id').eq('organisation_id', organisationId).eq('profile_id', claim.claimant_id).maybeSingle();
    if (!existingStaff) {
      const { error: staffErr } = await admin.from('organisation_staff').insert({
        organisation_id: organisationId,
        profile_id: claim.claimant_id,
        role: 'owner',
        invited_by: user.id,
      });
      if (staffErr) {
        console.error('[review-organisation-claim] Failed to grant staff access:', staffErr.message, staffErr.details, staffErr.hint);
        return json({ error: `Claim processed, but failed to grant staff access: ${staffErr.message}` }, 500);
      }
    }

    const { error: updateErr } = await admin.from('organisation_claims').update({
      status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), organisation_id: organisationId,
    }).eq('id', claimId);
    if (updateErr) { console.error('[review-organisation-claim] Failed to update claim status:', updateErr.message); return json({ error: updateErr.message }, 500); }

    // If this claimant's account is still gated behind pending club
    // approval (the direct club-signup flow, not an existing logged-in
    // user submitting a claim), activate it now — this is the only
    // thing that actually lets them log in.
    const { data: claimantProfile } = await admin.from('profiles').select('account_status').eq('id', claim.claimant_id).maybeSingle();
    const profileUpdate: Record<string, unknown> = { owned_organisation_id: organisationId };
    if (claimantProfile?.account_status === 'pending_club_approval') profileUpdate.account_status = 'active';

    // This write is the one thing that actually gets the claimant into
    // their org page on login (see LoginPage.tsx / App.tsx's
    // authenticatedDest, both of which key off profiles.owned_organisation_id).
    // Everything above this point (creating the org, granting staff access,
    // marking the claim approved) can succeed while this still silently
    // fails — previously its result was never checked, so the admin saw
    // "Approved" while the claimant's profile never actually got linked to
    // the organisation. Checking and surfacing the error here is the fix.
    const { error: profileLinkErr } = await admin.from('profiles').update(profileUpdate).eq('id', claim.claimant_id);
    if (profileLinkErr) {
      console.error('[review-organisation-claim] Failed to link organisation to claimant profile:', profileLinkErr.message, profileLinkErr.details, profileLinkErr.hint);
      return json({
        error: `Organisation approved and staff access granted, but failed to link it to the claimant's profile: ${profileLinkErr.message}. The claimant won't land on their org page until owned_organisation_id is set manually on profile ${claim.claimant_id} (organisation ${organisationId}).`,
      }, 500);
    }

    return json({ status: 'approved', organisationId });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
