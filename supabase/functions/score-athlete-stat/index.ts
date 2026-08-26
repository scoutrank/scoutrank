// Supabase Edge Function: score-athlete-stat
//
// Proxies the numeric AI-scoring Groq call that src/lib/aiScoring.ts makes
// after an admin verifies a stat (or resolves a dispute). Same reasoning
// as scout-bot-chat: aiScoring.ts was calling Groq directly from the
// browser using VITE_GROQ_API_KEY, which ships that key in plain text to
// every visitor. This is a thin, non-streaming passthrough — the actual
// scoring prompt/logic and all the privileged athlete_stats/rankings/
// profiles writes stay exactly where they were in aiScoring.ts, only the
// raw Groq API call itself moves server-side.
//
// Requires a logged-in Supabase session — deploy normally (WITHOUT
// --no-verify-jwt), same as scout-bot-chat.
//
// Deploy with: supabase functions deploy score-athlete-stat
// (Uses the same GROQ_API_KEY secret already set for the other functions
// — nothing new to configure.)

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_MODEL = 'openai/gpt-oss-120b';
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
        max_tokens: Math.min(maxTokens ?? 1000, MAX_TOKENS_CEILING),
        stream: false,
      }),
    });

    if (!groqRes.ok) {
      const text = await groqRes.text().catch(() => '');
      return json({ error: `Groq error ${groqRes.status}: ${text}` }, 502);
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return json({ content });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
