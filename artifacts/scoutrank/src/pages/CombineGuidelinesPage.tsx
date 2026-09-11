import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function CombineGuidelinesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-sr-silver">
      <Link to="/combine" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Combine
      </Link>

      <h1 className="text-2xl font-bold text-white mb-2">Combine Marketplace Guidelines</h1>
      <p className="text-sm text-sr-text-muted mb-8">
        How buying and selling works on Combine, ScoutRank's marketplace for coaching sessions, training programs, and assessments.
        This is a plain-language summary — the full legal terms are in our <Link to="/terms" className="text-sr-purple-light hover:text-white">Terms of Service</Link>.
      </p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-white font-semibold mb-2">How Combine works</h2>
          <p>The seller is the person actually providing the listed service and is responsible for delivering it as described. ScoutRank runs the marketplace that connects buyer and seller and handles payment through Stripe — we're not the seller, and we're not a party to the agreement between buyer and seller for the service itself.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">Becoming a seller</h2>
          <p>Selling on Combine requires approval, not just passing an automated check — some listings involve direct contact between a seller and a buyer, and some of our users are minors. We may decline or revoke seller status at our discretion, including after you've been approved.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">Listing standards</h2>
          <p>As a seller, you're responsible for making sure your listing is accurate and complete — description, price, and what's actually included — and for delivering what you describe. You may not list anything illegal, arrange payment outside ScoutRank/Stripe to avoid fees, misrepresent your qualifications or affiliation with a club, school, or organisation, or guarantee a specific recruitment outcome. Sporting recruitment outcomes can never be guaranteed by a service provider.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">Reviews</h2>
          <p>Buyers can leave a rating or review after a completed purchase. We don't independently verify that a review reflects an actual completed purchase — a review reflects the reviewer's own opinion, not ScoutRank's.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">Fees</h2>
          <p>Posting a listing costs a flat $5 fee, charged to you as the seller at the time of listing. Purchasing a listing costs the buyer the listed price plus a 10% transaction fee, added at checkout — you receive the listed price in full; the 10% is on top, not deducted from your payout.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">Minors and Combine</h2>
          <p>Only adult (18+) account holders can buy or sell on Combine. If a listed service is for the benefit of a minor athlete — a coaching session, for example — the purchase needs to be made through a parent or guardian's account, not the minor's own.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">Payouts</h2>
          <p>Payouts are issued by ScoutRank staff and aren't instant — check the app for the current expected timeline.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">Disputes</h2>
          <p>If something goes wrong with an order, raise it in-app: the seller gets a chance to respond, then ScoutRank reviews and makes a final call, including a refund where that's the right outcome. Nothing here limits your rights under Australian Consumer Law.</p>
        </section>
      </div>
    </div>
  );
}
