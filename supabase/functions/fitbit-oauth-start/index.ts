// Supabase Edge Function: fitbit-oauth-start
//
// Called by the logged-in user's browser. Generates a random state
// token (stored server-side, mapped to their profile_id) and returns
// the Fitbit authorization URL to redirect the browser to. The state
// token is how fitbit-oauth-callback later knows which ScoutRank user
// this connection belongs to, since Fitbit's redirect back has no
// Supabase session attached to it.
//
// Deploy with: supabase functions deploy fitbit-oauth-start
// Requires secret: supabase secrets set FITBIT_CLIENT_ID=...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

const FITBIT_CLIENT_ID = Deno.env.get('FITBIT_CLIENT_ID') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/fitbit-oauth-callback`;

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
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const state = crypto.randomUUID();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error: insertErr } = await admin.from('wearable_oauth_states').insert({ state, profile_id: user.id, provider: 'fitbit' });
    if (insertErr) return json({ error: `Failed to start connection: ${insertErr.message}` }, 500);

    const scopes = ['activity', 'heartrate', 'sleep', 'profile'].join(' ');
    const authUrl = `https://www.fitbit.com/oauth2/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: FITBIT_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: scopes,
      state,
    })}`;

    return json({ authUrl });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
