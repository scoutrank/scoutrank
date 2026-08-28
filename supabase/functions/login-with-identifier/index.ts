// Supabase Edge Function: login-with-identifier
//
// Auth's own signInWithPassword only accepts an email, but ScoutRank now
// lets people log in with either their email or their username. Resolving
// username -> email requires reading auth.users, which needs the service
// role key — not something a plain client can do — so that lookup happens
// here instead of on the client. This also means a username never gets
// exposed to the browser as "here's the email tied to that username" —
// worth keeping private even though usernames themselves are public, given
// this platform has minors on it.
//
// The client only ever calls this when the identifier isn't an email (see
// AuthContext.login) — the plain email/password path still goes straight
// through supabase.auth.signInWithPassword() with no extra network hop.
//
// Deploy with: supabase functions deploy login-with-identifier

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

// Same wording Supabase Auth itself uses for a bad email/password — reused
// here so an unknown username and a wrong password look identical to
// whoever's trying them, instead of confirming which usernames exist.
const GENERIC_ERROR = 'Invalid login credentials';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { identifier, password } = await req.json() as { identifier?: string; password?: string };
    if (!identifier || !password) return json({ error: 'Missing identifier or password.' }, 400);

    let email = identifier.trim();

    if (!email.includes('@')) {
      // Not an email shape — treat it as a username and resolve to the
      // account's real email server-side, using the service role (this is
      // the one place in the app allowed to read auth.users directly).
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: profile } = await admin
        .from('profiles')
        .select('user_id')
        .ilike('username', email)
        .maybeSingle();

      if (!profile?.user_id) return json({ error: GENERIC_ERROR }, 400);

      const { data: userData, error: userErr } = await admin.auth.admin.getUserById(profile.user_id);
      if (userErr || !userData?.user?.email) return json({ error: GENERIC_ERROR }, 400);
      email = userData.user.email;
    }

    // The actual password check happens here, via Auth's own token
    // endpoint — this function never verifies a password itself, it just
    // resolves the identifier and hands off to Auth exactly like the
    // client normally would with a plain email.
    const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return json({ error: tokenData?.error_description || tokenData?.msg || GENERIC_ERROR }, 400);
    }

    return json({ session: tokenData });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
