// Supabase Edge Function: review-stat-evidence
//
// This is the server-side, tamper-resistant version of AI evidence review.
// The client can no longer just claim "AI approved this" — it can only ask
// this function to review a stat, and only this function (running with
// the service role key, never exposed to the browser) can actually write
// verification_status. It also re-reads the claimed stat value, sport,
// and description directly from the database rather than trusting
// whatever the client sends, so a tampered request can't fake the inputs
// the AI is judging either.
//
// Deploy with: supabase functions deploy review-stat-evidence
// Requires these secrets set first:
//   supabase secrets set GROQ_API_KEY=your_groq_key
//   supabase secrets set ANTHROPIC_API_KEY=your_anthropic_key
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically
// by the Supabase platform to every Edge Function — no need to set those.)
//
// Evidence review (reading images/video frames to judge legitimacy) now
// runs on Claude instead of Groq's vision model — meaningfully better at
// reading fine detail (stopwatches, scoreboards, jersey numbers) and not
// subject to the same low per-minute token ceiling that was blocking
// video evidence review before. Numeric scoring stays on Groq — it's
// pure text, no images involved, and Groq is fast and cheap for that.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const CLAUDE_MODEL = 'claude-sonnet-5';
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

/**
 * Frames arrive as data: URLs (data:image/jpeg;base64,....) — Claude's
 * API wants just the raw base64 payload plus a separate media_type
 * field, not the data: URL wrapper.
 */
function dataUrlToClaudeImage(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
  if (!match) throw new Error('Frame is not a valid base64 image data URL.');
  return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
}

async function claudeVisionChat(system: string, userText: string, imageDataUrls: string[], maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: userText }, ...imageDataUrls.map(dataUrlToClaudeImage)],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude vision error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
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

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const today = new Date();
  const d = new Date(dob);
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { statId, frames, fileCount } = await req.json() as { statId: string; frames: string[]; fileCount?: number };
    if (!statId || !Array.isArray(frames) || frames.length === 0) {
      return json({ error: 'Missing statId or frames (image data URLs, extracted client-side).' }, 400);
    }
    // A submission can carry several separate photos/clips now, not just
    // one — fileCount (defaulting to 1 for older clients) tells the model
    // that, so it doesn't misread ordinary variation between two unrelated
    // files (different moment, angle, or even outfit change) as a
    // continuity red flag the way it reasonably would within one video.
    const evidenceFileCount = typeof fileCount === 'number' && fileCount > 0 ? fileCount : 1;

    // Identify the caller from their forwarded auth token — never trust a
    // client-supplied profile id.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    // Service-role client for the actual privileged reads/writes — this
    // is the whole point of moving this server-side: the browser never
    // gets a key that can bypass RLS, only this function does.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: stat, error: statErr } = await admin
      .from('athlete_stats')
      .select('*, stat_event_types(*)')
      .eq('id', statId)
      .maybeSingle();
    if (statErr || !stat) return json({ error: `Stat not found: ${statErr?.message ?? 'no such stat'}` }, 404);
    if (stat.profile_id !== user.id) return json({ error: 'This stat does not belong to you.' }, 403);
    if (stat.verification_status !== 'pending') return json({ error: 'This stat has already been processed.' }, 400);

    const { data: profile } = await admin.from('profiles').select('date_of_birth').eq('id', stat.profile_id).maybeSingle();
    const age = calculateAge(profile?.date_of_birth ?? null);

    const sport = stat.stat_event_types?.sport ?? stat.custom_sport ?? 'unknown';
    const eventLabel = stat.stat_event_types?.label ?? stat.custom_event_name ?? 'custom event';
    const unit = stat.stat_event_types?.unit ?? stat.custom_unit ?? '';
    const higherIsBetter = stat.stat_event_types?.higher_is_better ?? true;

    // ── Evidence review ──────────────────────────────────────────────
    const reviewPrompt = `You are reviewing evidence submitted for a claimed sports statistic on ScoutRank, a talent-scouting platform. \
Decide whether this evidence should be APPROVED or REJECTED.

Claimed stat: ${stat.value} ${unit} (${eventLabel}, ${sport})
Competition level claimed: ${stat.competition_level ?? 'not specified'}
Athlete's own description of the footage: "${stat.evidence_description ?? ''}"

You have been given ${frames.length} image(s) as evidence, drawn from ${evidenceFileCount} separate submitted file(s) (for video files these are frames sampled across that video's footage — not the full footage).${evidenceFileCount > 1 ? ' Frames belong to whichever file they were sampled from, in the order the files were submitted, but you are not told exactly where one file\'s frames end and the next begin — reason about the whole set together. Ordinary differences between separate files (a different moment, angle, or even a minor appearance change like removed headgear) are normal and NOT by themselves a red flag; only treat something as suspicious if it looks like genuinely different/unrelated content, not just a different clip of the same claim.' : ''}

WHAT TO ACTUALLY CHECK:
1. Does this look like genuine, relevant sports footage/photo for the claimed sport — not unrelated, fabricated, or reused?
2. Does what's visible plausibly match the athlete's own written description (jersey/guernsey number, headgear, appearance)? Minor uncertainty from image quality/angle is fine; a clear contradiction is not.
3. Does the context fit the claimed competition level?
4. You CANNOT reliably verify an exact count from still frames — do not reject solely for that. Only reject for a genuine red flag.

Default to APPROVING when the evidence is plausible and consistent, even without certainty on every detail.
Keep reasoning brief.

Respond with ONLY strict JSON, nothing else: {"approved": true or false, "reasoning": "<one or two short sentences>"}`;

    const reviewRaw = await claudeVisionChat(
      'You are a careful, fair content reviewer for a sports platform. You output only valid JSON, nothing else.',
      reviewPrompt,
      frames,
      2000,
    );
    const reviewParsed = JSON.parse(extractJsonObject(reviewRaw)) as { approved?: boolean; reasoning?: string };
    if (typeof reviewParsed.approved !== 'boolean') {
      return json({ error: `AI review returned no usable verdict. Raw: ${reviewRaw.slice(0, 300)}` }, 502);
    }
    const reasoning = reviewParsed.reasoning ?? '(no reasoning given)';

    if (!reviewParsed.approved) {
      const { error } = await admin.from('athlete_stats')
        .update({ verification_status: 'disputed', rejection_reason: reasoning })
        .eq('id', statId);
      if (error) return json({ error: `Disputed, but failed to save: ${error.message}` }, 500);

      const { error: disputeErr } = await admin.from('stat_disputes').insert({
        stat_id: statId,
        profile_id: stat.profile_id,
        ai_reasoning: reasoning,
        status: 'open',
      });
      if (disputeErr) return json({ error: `Disputed, but failed to queue for human review: ${disputeErr.message}` }, 500);

      return json({ status: 'disputed', reasoning });
    }

    // ── Approved — mark verified, then numeric AI scoring ────────────
    const { error: verifyErr } = await admin.from('athlete_stats').update({ verification_status: 'verified' }).eq('id', statId);
    if (verifyErr) return json({ error: `Approved, but failed to save: ${verifyErr.message}` }, 500);

    let comparisonQuery = admin.from('athlete_stats').select('value, competition_level')
      .eq('verification_status', 'verified').neq('id', statId).limit(40);
    comparisonQuery = stat.stat_event_type_id
      ? comparisonQuery.eq('stat_event_type_id', stat.stat_event_type_id)
      : comparisonQuery.eq('custom_sport', stat.custom_sport ?? '');
    const { data: comparisonRows } = await comparisonQuery;
    const hasComparisons = (comparisonRows ?? []).length > 0;

    const scorePrompt = `You are an expert sports scout and performance evaluator for ScoutRank. Score this ONE verified athletic result on a 0.00-100.00 scale reflecting genuine sporting merit.

Athlete age: ${age ?? 'unknown'}
Sport: ${sport}
Event/stat: ${eventLabel}
Result: ${stat.value} ${unit} (${higherIsBetter ? 'higher values are better' : 'lower values are better'})
Competition level: ${stat.competition_level ?? 'not specified'}

${hasComparisons
  ? `Other verified results in this event: ${JSON.stringify((comparisonRows ?? []).map((r: { value: number; competition_level: string | null }) => ({ value: r.value, level: r.competition_level })))}`
  : `No other verified results in this event yet — rely on your own real-world knowledge of ${sport} to judge this result confidently.`}

SCORE CALIBRATION — strict, not generous, but not falsely conservative either:
95.00-100.00: literally world-record/Olympic caliber — reserve almost never.
85.00-94.99: national-elite. 70.00-84.99: strong, well above-average. 50.00-69.99: solid/average. 30.00-49.99: below-average/developing. 10.00-29.99: weak. 0.00-9.99: minimal.
Use real decimal precision reflecting genuine variance — never a suspiciously clean/neutral number like 50.00 unless it genuinely belongs there.

Respond with ONLY strict JSON: {"score": <number>, "reasoning": "<one short sentence>"}`;

    const scoreRaw = await groqTextChat(
      [
        { role: 'system', content: 'You are an expert sports scout with deep knowledge of performance benchmarks across sports and levels. You output only valid JSON.' },
        { role: 'user', content: scorePrompt },
      ],
      1000,
    );
    const scoreParsed = JSON.parse(extractJsonObject(scoreRaw)) as { score?: number };
    let score = Number(scoreParsed.score);
    if (!Number.isFinite(score)) return json({ status: 'verified', reasoning, score: null, scoringError: 'AI scoring failed to return a usable number.' });
    score = Math.max(0, Math.min(100, Math.round(score * 100) / 100));

    await admin.from('athlete_stats').update({ ai_score: score }).eq('id', statId);

    // ── Recompute rankings (Open + age bracket) and overall profile score ──
    async function writeDivision(division: string, ageFilter: string | null) {
      let sq = admin.from('athlete_stats').select('ai_score, stat_event_types!inner(sport)')
        .eq('profile_id', stat.profile_id).eq('verification_status', 'verified')
        .eq('stat_event_types.sport', sport).not('ai_score', 'is', null);
      if (ageFilter) sq = sq.eq('age_group', ageFilter);
      const { data: standard } = await sq;

      let cq = admin.from('athlete_stats').select('ai_score')
        .eq('profile_id', stat.profile_id).eq('verification_status', 'verified')
        .eq('custom_sport', sport).not('ai_score', 'is', null);
      if (ageFilter) cq = cq.eq('age_group', ageFilter);
      const { data: custom } = await cq;

      const scores = [...(standard ?? []), ...(custom ?? [])]
        .map((r: { ai_score: number | null }) => r.ai_score)
        .filter((n: number | null): n is number => typeof n === 'number');
      if (scores.length === 0) return;
      const avg = Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 100) / 100;

      const { data: existing } = await admin.from('rankings').select('profile_id')
        .eq('profile_id', stat.profile_id).eq('sport', sport).eq('division', division).maybeSingle();
      if (existing) {
        await admin.from('rankings').update({ rank_score: avg, updated_at: new Date().toISOString() })
          .eq('profile_id', stat.profile_id).eq('sport', sport).eq('division', division);
      } else {
        await admin.from('rankings').insert({ profile_id: stat.profile_id, sport, rank_score: avg, division, updated_at: new Date().toISOString() });
      }
    }

    await writeDivision('Open', null);
    if (stat.age_group && stat.age_group !== 'Open') await writeDivision(stat.age_group, stat.age_group);

    const { data: allScored } = await admin.from('athlete_stats').select('ai_score')
      .eq('profile_id', stat.profile_id).eq('verification_status', 'verified').not('ai_score', 'is', null);
    const allScores = (allScored ?? []).map((r: { ai_score: number | null }) => r.ai_score).filter((n: number | null): n is number => typeof n === 'number');
    if (allScores.length > 0) {
      const overallAvg = Math.round((allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length) * 100) / 100;
      await admin.from('profiles').update({ scoutrank_score: overallAvg }).eq('id', stat.profile_id);
    }

    return json({ status: 'verified', reasoning, score });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
