// Supabase Edge Function: attach-signup-phone
//
// Part of "verify by text instead of email" on signup. The account was
// just created by supabase.auth.signUp() with email confirmation pending
// — no session exists yet, so the browser can't call
// supabase.auth.updateUser({ phone }) itself (that needs an active
// session). This function does it with the service role instead, then the
// client sends the actual SMS itself via supabase.auth.signInWithOtp(),
// which is a normal, client-safe call once the phone is attached to a
// real user record.
//
// Security note: this only works on an account that is BOTH unconfirmed
// (no email_confirmed_at) AND has no phone already set. That's the guard
// against someone using this endpoint to attach a phone number — and
// therefore a login path — onto a stranger's real, already-active
// account. It only ever operates on a brand-new, still-pending signup.
//
// INERT until a phone/SMS provider (e.g. Twilio) is configured in
// Supabase Auth settings (Authentication → Providers → Phone) — until
// then, signInWithOtp on the client will simply fail with a clear "phone
// provider not configured" style error, and no SMS (and no cost) is
// incurred. Deploy whenever ready — deploying doesn't turn SMS sending
// on by itself, the Supabase-side provider config does.
//
// Deploy with: supabase functions deploy attach-signup-phone

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
    const { userId, phone } = await req.json() as { userId?: string; phone?: string };
    if (!userId || !phone) return json({ error: 'Missing userId or phone.' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: getErr } = await admin.auth.admin.getUserById(userId);
    if (getErr || !userData?.user) return json({ error: 'Signup not found — please start signing up again.' }, 404);

    const user = userData.user;
    if (user.email_confirmed_at) {
      // Already confirmed some other way (or this isn't actually a fresh
      // pending signup) — refuse rather than let this be used to bolt a
      // phone-login path onto an existing, active account.
      return json({ error: 'This account is already confirmed.' }, 400);
    }
    if (user.phone) {
      return json({ error: 'A phone number is already attached to this signup.' }, 400);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, { phone });
    if (updateErr) return json({ error: updateErr.message }, 400);

    return json({ success: true });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
