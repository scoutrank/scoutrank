// Supabase Edge Function: fitbit-oauth-callback
//
// Fitbit redirects here directly after the user approves the connection
// on Fitbit's own site — no Supabase session is attached to this
// request, which is why fitbit-oauth-start stored a state token mapped
// to a profile_id ahead of time. Exchanges the authorization code for
// real access/refresh tokens and stores them, then redirects the
// browser back into the app.
//
// Deploy with: supabase functions deploy fitbit-oauth-callback --no-verify-jwt
// (needs --no-verify-jwt since Fitbit calls this directly, not a logged-in user)
// Requires secrets:
//   supabase secrets set FITBIT_CLIENT_ID=...
//   supabase secrets set FITBIT_CLIENT_SECRET=...
//   supabase secrets set SITE_URL=https://your-real-domain.vercel.app

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

const FITBIT_CLIENT_ID = Deno.env.get('FITBIT_CLIENT_ID') ?? '';
const FITBIT_CLIENT_SECRET = Deno.env.get('FITBIT_CLIENT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:5173';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/fitbit-oauth-callback`;

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const redirectWithResult = (result: 'connected' | 'error', message?: string) =>
    Response.redirect(`${SITE_URL}/settings?fitbit=${result}${message ? `&reason=${encodeURIComponent(message)}` : ''}`, 302);

  if (oauthError) return redirectWithResult('error', oauthError);
  if (!code || !state) return redirectWithResult('error', 'Missing code or state.');

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: stateRow, error: stateErr } = await admin.from('wearable_oauth_states').select('*').eq('state', state).maybeSingle();
  if (stateErr || !stateRow) return redirectWithResult('error', 'Invalid or expired connection attempt.');
  await admin.from('wearable_oauth_states').delete().eq('state', state);

  try {
    const basicAuth = btoa(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`);
    const tokenRes = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: new URLSearchParams({ client_id: FITBIT_CLIENT_ID, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI, code }),
    });
    if (!tokenRes.ok) return redirectWithResult('error', `Fitbit token exchange failed: ${await tokenRes.text()}`);
    const tokenData = await tokenRes.json();

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    const { error: upsertErr } = await admin.from('wearable_connections').upsert({
      profile_id: stateRow.profile_id,
      provider: 'fitbit',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      provider_user_id: tokenData.user_id,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'profile_id,provider' });
    if (upsertErr) return redirectWithResult('error', `Failed to save connection: ${upsertErr.message}`);

    return redirectWithResult('connected');
  } catch (err) {
    return redirectWithResult('error', err instanceof Error ? err.message : String(err));
  }
});
