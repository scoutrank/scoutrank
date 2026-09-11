import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BrandedContentPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-sr-silver">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <h1 className="text-2xl font-bold text-white mb-2">Branded Content & Sponsorship Policy</h1>
      <p className="text-xs text-sr-text-muted mb-8">Last updated: {new Date().toLocaleDateString()}</p>
      <p className="text-sm text-sr-text-muted mb-8">
        Rules for posting content on ScoutRank that promotes a business you have a paid or sponsored relationship with. See our{' '}
        <Link to="/terms" className="text-sr-purple-light hover:text-white">Terms of Service</Link> for the full legal terms this policy sits under.
      </p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-white font-semibold mb-2">What counts as branded content</h2>
          <p>Any post where you've received payment, free or discounted products, or anything else of value from a business in exchange for promoting that business. This applies whether you were paid in cash or simply given a free product — there's no minimum value that exempts you.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">You must disclose it</h2>
          <p>If a post is branded content, you need to clearly disclose that relationship in a way that's obvious to anyone viewing it — not buried or hidden. Use something like "#ad," "#sponsored," or "#paidpartnership," or a ScoutRank-provided disclosure tag if one is available in-app.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">Minors and sponsorships</h2>
          <p>If you're under 18, you need your parent or guardian's consent before entering into any paid partnership or sponsorship arrangement promoted through ScoutRank, and we may ask you to confirm that consent.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">What ScoutRank does and doesn't do</h2>
          <p>We don't review or verify sponsorship disclosures for accuracy, and we're not a party to the arrangement between you and the business — you're solely responsible for complying with your own disclosure obligations under Australian Consumer Law.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">If you don't disclose</h2>
          <p>Undisclosed branded content is a breach of our Terms of Service and can lead to the content being removed or your account being restricted, in the same way as other prohibited conduct.</p>
        </section>
      </div>
    </div>
  );
}
