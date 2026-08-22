import { loadStripe } from '@stripe/stripe-js';

// Publishable keys are designed to be exposed in client-side code —
// unlike the secret key, this one carries no risk if visible, so it's
// safe to keep directly here rather than needing a build-time env var.
export const stripePromise = loadStripe('pk_test_51U3Q95Rsnnzp3kdg0hUfVHu6RcJy55I6YNiYZ6sYkuGYipPA1OnueBpxEogMxpYU6uAuEAX00KZ2dCAPBl85KMeD00D2WC4i74');
