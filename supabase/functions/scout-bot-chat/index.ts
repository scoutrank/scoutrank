// Supabase Edge Function: scout-bot-chat
//
// Proxies Scout Bot's streaming chat completions to Groq, server-side.
//
// Previously the browser called Groq directly using VITE_GROQ_API_KEY —
// a Vite env var prefixed with VITE_ gets baked as a literal string into
// the built client JS bundle, which ships to every visitor. That means
// the real Groq API key was sitting in plain text in ScoutRank's public
// bundle, extractable by anyone who opened devtools, with no rate limit
// or auth check of any kind — it could be scraped and used against
// Blaze's own Groq billing/quota with zero connection to ScoutRank at
// all. This function keeps the key server-side (as a Deno secret, same
// as the GROQ_API_KEY already used by review-marketplace-listing) and
// just proxies the request through, so the client never sees it.
//
// Deliberately a thin, mostly-transparent passthrough: forwards the
// caller's message list to Groq and streams Groq's own SSE response
// straight back unchanged, so the existing client-side stream parser
// (groqStream in src/lib/groq.ts) needs no changes to its parsing logic.
//
// Requires a logged-in Supabase session — deploy normally (WITHOUT
// --no-verify-jwt, unlike stripe-webhook), so Supabase's own gateway
// rejects unauthenticated requests before this code even runs.
//
// Deploy with: supabase functions deploy scout-bot-chat

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
// Must match GROQ_MODEL in src/lib/groq.ts.
const GROQ_MODEL = 'openai/gpt-oss-120b';
// Hard ceiling regardless of what a caller requests — this endpoint is
// reachable by any logged-in user, so it shouldn't be possible to ask
// for an arbitrarily expensive completion.
const MAX_TOKENS_CEILING = 2048;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { messages, maxTokens } = await req.json() as { messages?: ChatMessage[]; maxTokens?: number };
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'Missing messages.' }, 400);
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        max_tokens: Math.min(maxTokens ?? 1024, MAX_TOKENS_CEILING),
        stream: true,
      }),
    });

    if (!groqRes.ok || !groqRes.body) {
      const text = await groqRes.text().catch(() => '');
      return json({ error: `Groq error ${groqRes.status}: ${text}` }, 502);
    }

    // Straight passthrough of Groq's own "data: {...}" SSE stream.
    return new Response(groqRes.body, {
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream' },
    });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
