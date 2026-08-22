import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-sr-silver">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
        <strong>Draft — not yet reviewed by a lawyer.</strong> This is a starting-point document, not final legal
        text. Since ScoutRank is used by minors, this should be reviewed by an actual lawyer (covering the specific
        laws that apply where your users are — e.g. COPPA in the US, the Australian Privacy Act, GDPR in the EU)
        before this is relied on as a real Terms of Service.
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">Terms of Service</h1>
      <p className="text-xs text-sr-text-muted mb-8">Last updated: {new Date().toLocaleDateString()}</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-white font-semibold mb-2">1. Who can use ScoutRank</h2>
          <p>ScoutRank is a sports talent-scouting platform. By creating an account, you confirm the information you provide is accurate. If you're under 18, a parent or guardian should be aware of your use of the platform.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">2. Your account</h2>
          <p>You're responsible for keeping your login details secure and for activity that happens under your account. Tell us right away if you think someone else has accessed it.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">3. Content you post</h2>
          <p>You keep ownership of what you post — stats, highlights, photos, and videos. By posting, you give ScoutRank permission to display it on the platform. You're responsible for making sure what you post is accurate and doesn't violate anyone else's rights.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">4. Community standards</h2>
          <p>ScoutRank has real content moderation — posts, comments, and messages may be reviewed (including by automated systems) for safety. Accounts that violate our <Link to="/community-guidelines" className="text-sr-purple-light hover:text-white">Community Guidelines</Link> may be warned, restricted, suspended, or banned. See that page for what's and isn't allowed.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">5. Verified stats and scoring</h2>
          <p>Athletic stats submitted for verification are reviewed by AI, and in some cases a human reviewer, before contributing to your ScoutRank score. We aim for this process to be fair and consistent, but scores are an estimate of performance, not a guarantee of recruitment or selection outcomes.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">6. Your data</h2>
          <p>You can download a copy of your data or request deletion of your account at any time from Settings. See our <Link to="/privacy" className="text-sr-purple-light hover:text-white">Privacy Policy</Link> for details on what we collect and why.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">7. Account actions</h2>
          <p>We may warn, restrict, suspend, or ban an account that violates these terms or our Community Guidelines. Where an account is suspended or banned, we'll tell you why. You can dispute a decision through the app.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">8. Changes</h2>
          <p>We may update these terms from time to time. Continued use of ScoutRank after a change means you accept the updated terms.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">9. Contact</h2>
          <p>Questions about these terms can be directed to ScoutRank support.</p>
        </section>
      </div>
    </div>
  );
}
