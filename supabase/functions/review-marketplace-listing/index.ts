// Supabase Edge Function: review-marketplace-listing
//
// Runs right after a listing is created. Text-only review of the title,
// description, category, and price — genuinely useful for catching
// inappropriate content and obviously low-effort/suspicious listings,
// but honest about its real limit: this can't verify against the whole
// internet whether something is "actually just a free resource being
// resold" — that would need real web search, which this doesn't do.
// What it CAN catch: policy violations, and listings that read as
// vague, generic, or implausible for their stated price. Anything the
// AI isn't confident about goes to a human admin instead of guessing.
//
// Deploy with: supabase functions deploy review-marketplace-listing

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { listingId } = await req.json() as { listingId: string };
    if (!listingId) return json({ error: 'Missing listingId.' }, 400);

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: listing, error: listingErr } = await admin.from('marketplace_listings').select('*').eq('id', listingId).maybeSingle();
    if (listingErr || !listing) return json({ error: `Listing not found: ${listingErr?.message ?? 'no such listing'}` }, 404);
    if (listing.seller_id !== user.id) return json({ error: 'This listing does not belong to you.' }, 403);
    // This is what actually flips a listing to 'active' and makes it
    // purchasable, so it needs its own check that the listing fee was
    // really paid — the client only calls this after its fee_paid poll
    // succeeds, but that's a UI sequencing choice, not enforcement.
    if (!listing.fee_paid) return json({ error: 'The listing fee has not been paid yet.' }, 403);

    const priceDisplay = `$${(listing.price_cents / 100).toFixed(2)} ${listing.currency?.toUpperCase() ?? 'USD'}`;

    const prompt = `Review this marketplace listing on a sports talent-scouting platform before it goes live for sale.

Title: "${listing.title}"
Description: "${listing.description ?? '(none provided)'}"
Category: ${listing.category}
Price: ${priceDisplay}
Delivery: ${listing.delivery_type === 'digital_download' ? 'digital file/download' : 'live coaching session'}
Has an attached file or link: ${listing.file_url || listing.file_path ? 'yes' : 'no'}

Check for two separate things:
1. APPROPRIATENESS — no inappropriate, harmful, or unsafe content; nothing targeting or exploiting minors; no scams.
2. PLAUSIBILITY — does this read like a genuine, specific product someone put real effort into (a real training program, a real coaching offer), or does it read as vague, generic, or implausible for a paid product at this price (e.g. a one-line description with no real detail, price wildly mismatched to what's described)?

Be conservative — most listings from real coaches/athletes describing genuine training content should NOT be flagged. Only flag clear appropriateness violations, or listings that are genuinely too vague/suspicious to approve confidently.

Respond with ONLY strict JSON, nothing else: {"flagged": true or false, "reason": "<one short sentence, only if flagged>"}`;

    let raw: string;
    try {
      raw = await groqTextChat(
        [
          { role: 'system', content: 'You are a careful, conservative marketplace listing reviewer. You only flag genuine concerns, not normal product listings. You output only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        1500,
      );
    } catch (err) {
      return json({ error: `Review AI call failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }

    let parsed: { flagged?: boolean; reason?: string };
    try {
      parsed = JSON.parse(extractJsonObject(raw));
    } catch {
      return json({ error: `Review AI did not return valid JSON. Raw: ${raw.slice(0, 300)}` }, 502);
    }
    if (typeof parsed.flagged !== 'boolean') {
      return json({ error: `Review AI returned no usable verdict. Raw: ${raw.slice(0, 300)}` }, 502);
    }

    if (!parsed.flagged) {
      const { error: approveErr } = await admin.from('marketplace_listings').update({ status: 'active' }).eq('id', listingId);
      if (approveErr) return json({ error: `Approved by AI, but failed to update status: ${approveErr.message}` }, 500);
      return json({ approved: true });
    }

    const { error: reviewErr } = await admin.from('marketplace_listing_reviews').insert({
      listing_id: listingId,
      ai_reasoning: parsed.reason ?? '(no reason given)',
      status: 'open',
    });
    if (reviewErr) return json({ error: `Flagged for review, but failed to save: ${reviewErr.message}` }, 500);

    return json({ approved: false, reason: parsed.reason });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
