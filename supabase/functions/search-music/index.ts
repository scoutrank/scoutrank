// Supabase Edge Function: search-music
//
// Live search against Jamendo's public music API — a real catalog of
// roughly 400-500k Creative Commons tracks, not a pre-uploaded bucket.
// Runs server-side so the client_id never sits in client code, and so
// results can be filtered to commercially-safe license types before
// they ever reach the picker — Jamendo's catalog uses a mix of CC
// license variants, not all of which permit commercial use freely, so
// this only surfaces tracks tagged for commercial use.
//
// Deploy with: supabase functions deploy search-music
// Requires secret: supabase secrets set JAMENDO_CLIENT_ID=your_client_id

const JAMENDO_CLIENT_ID = Deno.env.get('JAMENDO_CLIENT_ID') ?? '';

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
    const { q, limit: limitParam } = await req.json().catch(() => ({ q: '', limit: 25 })) as { q?: string; limit?: number };
    const query = (q ?? '').trim();
    const limit = Math.min(Number(limitParam) || 25, 50);

    const jamendoUrl = new URL('https://api.jamendo.com/v3.0/tracks/');
    jamendoUrl.searchParams.set('client_id', JAMENDO_CLIENT_ID);
    jamendoUrl.searchParams.set('format', 'json');
    jamendoUrl.searchParams.set('limit', String(limit));
    jamendoUrl.searchParams.set('include', 'musicinfo');
    // Only commercial-use-safe licenses — excludes the non-commercial
    // (ccnc) CC variants so nothing surfaced here is off-limits for use
    // in someone's posted video.
    jamendoUrl.searchParams.set('ccnc', 'false');
    jamendoUrl.searchParams.set('audioformat', 'mp32');
    if (query) jamendoUrl.searchParams.set('search', query);
    else jamendoUrl.searchParams.set('order', 'popularity_total');

    const res = await fetch(jamendoUrl.toString());
    if (!res.ok) return json({ error: `Jamendo API error ${res.status}: ${await res.text()}` }, 502);
    const data = await res.json();

    const tracks = (data.results ?? []).map((t: {
      id: string; name: string; artist_name: string; audio: string; audiodownload: string;
      image: string; duration: number; license_ccurl: string;
    }) => ({
      id: t.id,
      name: t.name,
      artist: t.artist_name,
      url: t.audiodownload || t.audio,
      artwork: t.image,
      durationSeconds: t.duration,
      licenseUrl: t.license_ccurl,
    }));

    return json({ tracks });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
