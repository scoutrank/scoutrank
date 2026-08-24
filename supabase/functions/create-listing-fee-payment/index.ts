// Supabase Edge Function: create-listing-fee-payment
//
// Charges the seller a 15% listing fee (of their own asking price)
// before a listing proceeds to AI/admin review. Separate payment from
// the buyer-side purchase flow — this one is paid by the seller, once,
// at listing creation. Uses the same embedded Stripe Elements pattern
// as marketplace purchases (see create-checkout-session) rather than a
// hosted redirect page.
//
// Deploy with: supabase functions deploy create-listing-fee-payment

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// 15% of the seller's own asking price, charged upfront to post a
// listing — separate from the 5% buyer-side surcharge applied later
// at sale time (see create-checkout-session).
const LISTING_FEE_PERCENT = 15;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });

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
    if (listing.fee_paid) return json({ error: 'The listing fee has already been paid for this listing.' }, 400);

    // The client only shows the "create a listing" form to approved
    // sellers, but that's a UI gate, not a security boundary — anyone
    // authenticated could call this function directly. Re-check
    // seller_status here since this is the actual point where money
    // moves and a listing enters the review pipeline.
    const { data: sellerProfile, error: sellerErr } = await admin.from('profiles').select('seller_status').eq('id', user.id).maybeSingle();
    if (sellerErr || !sellerProfile) return json({ error: 'Could not verify seller status.' }, 403);
    if (sellerProfile.seller_status !== 'approved') return json({ error: 'You must be an approved seller before you can list a product for sale.' }, 403);

    const feeCents = Math.round(listing.price_cents * LISTING_FEE_PERCENT / 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: feeCents,
      currency: listing.currency ?? 'usd',
      metadata: { type: 'listing_fee', listing_id: listing.id },
      description: `Listing fee: ${listing.title}`,
      automatic_payment_methods: { enabled: true },
    });

    await admin.from('marketplace_listings').update({
      fee_amount_cents: feeCents,
      fee_payment_intent_id: paymentIntent.id,
    }).eq('id', listingId);

    return json({ clientSecret: paymentIntent.client_secret, feeCents });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
