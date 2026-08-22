// Supabase Edge Function: proxy-music
//
// Jamendo's audio CDN doesn't send an Access-Control-Allow-Origin
// header, which blocks the browser from routing that audio through the
// Web Audio API (needed to actually mix it with the microphone for
// recording) — simple <audio> playback works fine without this, which
// is why the preview button works but recording didn't. This function
// fetches the file server-side (a server-to-server fetch isn't subject
// to browser CORS at all) and re-serves the bytes with the header the
// browser actually needs.
//
// Deploy with: supabase functions deploy proxy-music
// No secrets needed — this just proxies a URL passed in as a parameter.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get('url');
    // Only ever proxy Jamendo's own storage domain — this must never
    // become an open proxy for arbitrary URLs.
    if (!target || !/^https:\/\/[a-z0-9.-]*\.jamendo\.com\//i.test(target)) {
      return new Response('Invalid or disallowed URL.', { status: 400, headers: CORS_HEADERS });
    }

    const upstream = await fetch(target);
    if (!upstream.ok || !upstream.body) {
      return new Response(`Upstream fetch failed: ${upstream.status}`, { status: 502, headers: CORS_HEADERS });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    return new Response(`Unexpected server error: ${err instanceof Error ? err.message : String(err)}`, { status: 500, headers: CORS_HEADERS });
  }
});
