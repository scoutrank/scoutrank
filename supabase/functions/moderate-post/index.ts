// Supabase Edge Function: moderate-post
//
// Runs right after a post (or highlight) is created. Scans the caption
// text always, and the media (photo directly, or client-extracted video
// frames) when present, for content that looks inappropriate, dangerous,
// or otherwise concerning. Flagged posts go into flagged_content for a
// human to review — this never auto-deletes anything, it only flags.
//
// Deploy with: supabase functions deploy moderate-post
// Uses the same GROQ_API_KEY secret as review-stat-evidence.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GROQ_VISION_MODEL = 'qwen/qwen3.6-27b';
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

async function groqVisionChat(messages: unknown[], maxTokens: number): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_VISION_MODEL, messages, max_tokens: maxTokens, stream: false }),
  });
  if (!res.ok) throw new Error(`Groq vision error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0]?.message?.content ?? '';
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

const MODERATION_INSTRUCTIONS = `Flag content that is genuinely concerning for a sports talent-scouting platform used by teenagers and adults: \
sexual or suggestive content, graphic violence or gore, dangerous acts/challenges, hate symbols or hate speech, harassment or bullying, \
self-harm content, or anything illegal.

IMPORTANT — two different situations require different judgment:
1. If the caption directly and explicitly states or claims something concerning (e.g. it says outright that it "promotes self-harm", \
contains a direct threat, or explicitly describes graphic violence) — flag it. An explicit, unambiguous statement like this should almost \
always be flagged, generally at medium-to-high severity, even if you can't independently verify it from the media. Do not talk yourself \
out of flagging a caption that plainly says what it is.
2. For everything else — normal sports contact, normal competitive intensity, normal athletic clothing, ordinary trash talk, or content \
that is merely ambiguous or ordinary — be conservative and do not flag it. Most everyday posts fall into this category and should NOT be flagged.
The "be conservative" guidance is for genuinely ambiguous/ordinary content, not for captions that directly say something explicit and concerning.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { postId, frames } = await req.json() as { postId: string; frames?: string[] };
    if (!postId) return json({ error: 'Missing postId.' }, 400);

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: post, error: postErr } = await admin.from('posts').select('*').eq('id', postId).maybeSingle();
    if (postErr || !post) return json({ error: `Post not found: ${postErr?.message ?? 'no such post'}` }, 404);
    // Only the poster's own submission can trigger a scan of it (a scan
    // is harmless either way, but no reason to allow scanning arbitrary
    // other people's posts on demand).
    if (post.profile_id !== user.id) return json({ error: 'This post does not belong to you.' }, 403);

    let imageParts: { type: string; image_url: { url: string } }[] = [];
    if (Array.isArray(frames) && frames.length > 0) {
      imageParts = frames.map(url => ({ type: 'image_url', image_url: { url } }));
    }

    const prompt = `Review this social post from a sports platform for content moderation purposes.

Caption: ${post.caption ? `"${post.caption}"` : '(no caption)'}
${imageParts.length > 0 ? `You have also been given ${imageParts.length} image(s) from the post's media.` : 'No media to review — text only.'}

${MODERATION_INSTRUCTIONS}

Keep any internal reasoning brief and focused — go straight to the point rather than exploring every possibility at length.

Respond with ONLY strict JSON, nothing else: {"flagged": true or false, "severity": "low" or "medium" or "high" (omit or null if not flagged), "reason": "<one short sentence, only if flagged>"}`;

    let raw: string;
    try {
      raw = imageParts.length > 0
        ? await groqVisionChat(
            [
              { role: 'system', content: 'You are a careful, conservative content moderator. You only flag genuine concerns, not normal sports content. You output only valid JSON.' },
              { role: 'user', content: [{ type: 'text', text: prompt }, ...imageParts] },
            ],
            3000,
          )
        : await groqTextChat(
            [
              { role: 'system', content: 'You are a careful, conservative content moderator. You only flag genuine concerns, not normal sports content or trash talk. You output only valid JSON.' },
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
      post_id: postId,
      profile_id: post.profile_id,
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
