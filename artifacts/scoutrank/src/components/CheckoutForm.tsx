import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { Loader2 } from 'lucide-react';

/**
 * Embedded directly on the page via Stripe Elements — the buyer/seller
 * never leaves ScoutRank's own UI, unlike Stripe's hosted Checkout page
 * which redirects away. Styled to match the app's actual dark/purple
 * theme via Stripe's appearance API rather than looking like a
 * generic bolted-on payment box. Reused for both marketplace purchases
 * and the seller's upfront listing fee — onSuccess handles whatever
 * happens next for each specific case.
 */
function InnerForm({ returnUrl, onSuccess, buttonLabel }: { returnUrl: string; onSuccess: () => void | Promise<void>; buttonLabel: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    });

    if (stripeError) {
      setSubmitting(false);
      setError(stripeError.message ?? 'Payment failed. Please try again.');
      return;
    }

    // No redirect happened (card paid instantly, no 3D Secure needed).
    // Stay in the submitting/loading state through onSuccess too, since
    // it may itself wait briefly for server-side confirmation — ending
    // the loading state here would make the button look idle while
    // something is still actually happening.
    await onSuccess();
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={!stripe || submitting}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {submitting ? 'Processing...' : buttonLabel}
      </button>
    </form>
  );
}

export function CheckoutForm({ clientSecret, returnUrl, onSuccess, buttonLabel = 'Pay Now' }: { clientSecret: string; returnUrl: string; onSuccess: () => void | Promise<void>; buttonLabel?: string }) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#8A3FFC',
            colorBackground: '#131730',
            colorText: '#E8E9F0',
            colorTextSecondary: '#8B8FA8',
            colorDanger: '#F87171',
            fontFamily: 'inherit',
            borderRadius: '10px',
            spacingUnit: '4px',
          },
          rules: {
            '.Input': { border: '1px solid #2A2F45', backgroundColor: '#0B0E1A' },
            '.Input:focus': { border: '1px solid #8A3FFC', boxShadow: 'none' },
            '.Label': { color: '#8B8FA8', fontSize: '12px' },
          },
        },
      }}
    >
      <InnerForm returnUrl={returnUrl} onSuccess={onSuccess} buttonLabel={buttonLabel} />
    </Elements>
  );
}
