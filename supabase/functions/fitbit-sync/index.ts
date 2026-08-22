// Supabase Edge Function: fitbit-sync
//
// Called by the connected user's browser to pull today's activity data
// from Fitbit and store it. Refreshes the access token first if it's
// expired — Fitbit tokens are short-lived (a few hours), so this will
// need to happen on most syncs, not just occasionally.
//
// Deploy with: supabase functions deploy fitbit-sync

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

const FITBIT_CLIENT_ID = Deno.env.get('FITBIT_CLIENT_ID') ?? '';
const FITBIT_CLIENT_SECRET = Deno.env.get('FITBIT_CLIENT_SECRET') ?? '';
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

async function refreshFitbitToken(refreshToken: string) {
  const basicAuth = btoa(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`);
  const res = await fetch('https://api.fitbit.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Fitbit token refresh failed: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: conn, error: connErr } = await admin.from('wearable_connections').select('*').eq('profile_id', user.id).eq('provider', 'fitbit').maybeSingle();
    if (connErr || !conn) return json({ error: 'Fitbit is not connected.' }, 404);

    let accessToken = conn.access_token;
    if (new Date(conn.expires_at).getTime() <= Date.now() + 60_000) {
      const refreshed = await refreshFitbitToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      await admin.from('wearable_connections').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('id', conn.id);
    }

    const today = new Date().toISOString().slice(0, 10);
    const activityRes = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${today}.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!activityRes.ok) return json({ error: `Fitbit activity fetch failed: ${await activityRes.text()}` }, 502);
    const activity = await activityRes.json();

    const summary = activity.summary ?? {};
    const { error: upsertErr } = await admin.from('wearable_activity_data').upsert({
      profile_id: user.id,
      provider: 'fitbit',
      data_date: today,
      steps: summary.steps ?? null,
      resting_heart_rate: summary.restingHeartRate ?? null,
      active_minutes: (summary.fairlyActiveMinutes ?? 0) + (summary.veryActiveMinutes ?? 0),
      distance_km: summary.distances?.find((d: { activity: string }) => d.activity === 'total')?.distance ?? null,
      calories_burned: summary.caloriesOut ?? null,
      raw_data: activity,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'profile_id,provider,data_date' });
    if (upsertErr) return json({ error: `Failed to save activity data: ${upsertErr.message}` }, 500);

    await admin.from('wearable_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id);

    return json({ synced: true, steps: summary.steps, restingHeartRate: summary.restingHeartRate });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
