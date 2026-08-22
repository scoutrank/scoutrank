// Supabase Edge Function: create-checkout-session
//
// Creates a Stripe PaymentIntent for a marketplace purchase — used with
// Stripe Elements embedded directly on the listing page, so the buyer
// never leaves ScoutRank's own UI (as opposed to Stripe's own hosted
// Checkout page, which redirects away). Phase 1 payout model:
// ScoutRank's own Stripe account collects the full payment (not Stripe
// Connect yet), and the 70/30 seller/platform split is recorded in
// marketplace_orders for manual payout tracking. This keeps the
// architecture ready to swap in Stripe Connect later without a rebuild:
// the split is already computed and stored per-order.
//
// Deploy with: supabase functions deploy create-checkout-session
// Requires secret: supabase secrets set STRIPE_SECRET_KEY=sk_test_...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Buyer pays the seller's listed price plus a 5% surcharge on top —
// the seller receives their full asking price, ScoutRank keeps the
// surcharge. E.g. listed at $30 → buyer charged $31.50 → seller gets
// $30, platform keeps $1.50. Separate from the 15% listing fee the
// seller pays upfront to post (see create-listing-fee-payment).
const SURCHARGE_PERCENT = 5;

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
    if (listing.status !== 'active') return json({ error: 'This listing is not currently available for purchase.' }, 400);
    if (listing.seller_id === user.id) return json({ error: "You can't buy your own listing." }, 400);

    const platformFeeCents = Math.round(listing.price_cents * SURCHARGE_PERCENT / 100);
    const sellerShareCents = listing.price_cents;
    const totalChargeCents = listing.price_cents + platformFeeCents;

    const { data: order, error: orderErr } = await admin.from('marketplace_orders').insert({
      listing_id: listing.id,
      listing_title_snapshot: listing.title,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      amount_cents: totalChargeCents,
      platform_fee_cents: platformFeeCents,
      seller_share_cents: sellerShareCents,
      status: 'awaiting_payment',
    }).select('id').single();
    if (orderErr || !order) return json({ error: `Failed to create order: ${orderErr?.message}` }, 500);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalChargeCents,
      currency: listing.currency ?? 'usd',
      metadata: { type: 'marketplace_order', order_id: order.id, listing_id: listing.id },
      description: listing.title,
      automatic_payment_methods: { enabled: true },
    });

    await admin.from('marketplace_orders').update({ stripe_checkout_session_id: paymentIntent.id }).eq('id', order.id);

    return json({ clientSecret: paymentIntent.client_secret, orderId: order.id });
  } catch (err) {
    return json({ error: `Unexpected server error: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});

