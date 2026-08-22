// Supabase Edge Function: stripe-webhook
//
// Stripe calls this when a checkout session completes. This is the only
// trustworthy place to mark an order "paid" — never trust the client's
// success_url redirect alone, since a person can just navigate there
// without actually paying. Signature verification confirms the request
// genuinely came from Stripe.
//
// Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
// (needs --no-verify-jwt since Stripe calls this directly, not through
// a logged-in user's session)
//
// After deploying, add the webhook in the Stripe Dashboard:
// Developers → Webhooks → Add endpoint → URL is this function's URL →
// Events to send: payment_intent.succeeded
// Then copy the "Signing secret" it gives you and run:
// supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature ?? '', STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const paymentType = paymentIntent.metadata?.type;

    if (paymentType === 'listing_fee') {
      const listingId = paymentIntent.metadata?.listing_id;
      if (listingId) {
        await admin.from('marketplace_listings').update({ fee_paid: true, status: 'pending_review' }).eq('id', listingId);
      }
    } else if (paymentType === 'marketplace_order') {
      const orderId = paymentIntent.metadata?.order_id;
      if (orderId) {
        await admin.from('marketplace_orders').update({ status: 'paid' }).eq('id', orderId);

        const { data: order } = await admin.from('marketplace_orders').select('seller_id, buyer_id, listing_title_snapshot').eq('id', orderId).maybeSingle();
        if (order) {
          await admin.from('notifications').insert({
            recipient_id: order.seller_id,
            actor_id: order.buyer_id,
            type: 'marketplace_sale_paid',
            target_type: 'marketplace_order',
            target_id: orderId,
          });
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
