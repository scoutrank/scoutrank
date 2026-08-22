// Supabase Edge Function: moderate-comment
//
// Runs right after a comment is posted. Text-only (comments have no
// media), so this is simpler than moderate-post — no vision model, no
// image downsizing to worry about. Flags genuinely concerning comments
// into flagged_content for human review, same as posts.
//
// Deploy with: supabase functions deploy moderate-comment
// Uses the same GROQ_API_KEY secret as the other moderation functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

function extractJsonObject(raw: string): string {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const withoutFences = withoutThinking.replace(/```json|```/g, '');
  const match = withoutFences.match(/\{[\s\S]*\}/);
  return (match ? match[0] : withoutFences).trim();
}

async function groqTextChat(messages: unknown[], maxTokens: number): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_TEXT_MODEL, messages, max_tokens: maxTokens, stream: false }),
  });
  if (!res.ok) throw new Error(`Groq text error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0]?.message?.content ?? '';
}

const MODERATION_INSTRUCTIONS = `Flag comments that are genuinely concerning on a sports talent-scouting platform used by teenagers and adults: \
harassment or bullying directed at another person, sexual or suggestive comments, hate speech or slurs, threats, self-harm content, or spam/scam links.

IMPORTANT — two different situations require different judgment:
1. If the comment directly and explicitly states or claims something concerning — flag it, generally at medium-to-high severity.
2. For everything else — normal trash talk, disagreement, ordinary banter, or content that is merely ambiguous or ordinary — be conservative \
and do not flag it. Most everyday comments fall into this category and should NOT be flagged.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { commentId } = await req.json() as { commentId: string };
    if (!commentId) return json({ error: 'Missing commentId.' }, 400);

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: comment, error: commentErr } = await admin.from('post_comments').select('*').eq('id', commentId).maybeSingle();
    if (commentErr || !comment) return json({ error: `Comment not found: ${commentErr?.message ?? 'no such comment'}` }, 404);
    if (comment.profile_id !== user.id) return json({ error: 'This comment does not belong to you.' }, 403);
    if (!comment.content || !comment.content.trim()) return json({ flagged: false });

    const prompt = `Review this comment from a sports platform for content moderation purposes.

Comment: "${comment.content}"

${MODERATION_INSTRUCTIONS}

Keep any internal reasoning brief and focused — go straight to the point.

Respond with ONLY strict JSON, nothing else: {"flagged": true or false, "severity": "low" or "medium" or "high" (omit or null if not flagged), "reason": "<one short sentence, only if flagged>"}`;

    let raw: string;
    try {
      raw = await groqTextChat(
        [
          { role: 'system', content: 'You are a careful, conservative content moderator. You only flag genuine concerns, not normal banter or trash talk. You output only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        2000,
      );
    } catch (err) {
      return json({ error: `Moderation AI call failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }

    let parsed: { flagged?: boolean; severity?: string; reason?: string };
    try {
      parsed = JSON.parse(extractJsonObject(raw));
    } catch {
      const looksTruncated = /<think>/i.test(raw) && !/<\/think>/i.test(raw);
      return json({
        error: looksTruncated
          ? `AI response was cut off mid-reasoning before it could answer (ran out of token budget). Raw: ${raw.slice(0, 300)}`
          : `Moderation AI did not return valid JSON. Raw: ${raw.slice(0, 300)}`,
      }, 502);
    }
    if (typeof parsed.flagged !== 'boolean') {
      return json({ error: `Moderation AI returned no usable verdict. Raw: ${raw.slice(0, 300)}` }, 502);
    }

    if (!parsed.flagged) return json({ flagged: false });

    const { error: flagErr } = await admin.from('flagged_content').insert({
      comment_id: commentId,
      post_id: comment.post_id,
      profile_id: comment.profile_id,
      reason: parsed.reason ?? '(no reason given)',
      severity: ['low', 'medium', 'high'].includes(parsed.severity ?? '') ? parsed.severity : 'medium',
      status: 'open',
    });
    if (flagErr) return json({ error: `Flagged, but failed to save: ${flagErr.message}` }, 500);

    return json({ flagged: true, severity: parsed.severity, reason: parsed.reason });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
