import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-sr-silver">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
        <strong>Draft — not yet reviewed by a lawyer.</strong> This describes what the app actually does today, but
        isn't final legal text. Since ScoutRank handles minors' data, this needs review against the specific privacy
        laws that apply where your users are (e.g. COPPA in the US, the Australian Privacy Act, GDPR in the EU)
        before it's relied on as a real Privacy Policy.
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-xs text-sr-text-muted mb-8">Last updated: {new Date().toLocaleDateString()}</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-white font-semibold mb-2">1. What we collect</h2>
          <p>When you sign up: your name, username, email, date of birth, location, and sport information. When you use the app: posts, comments, messages, stats you submit, and photos/videos you upload. We also capture the IP address your account was created from, used only to help detect ban evasion.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">2. How we use it</h2>
          <p>To run the platform — showing your profile and posts to others, calculating your ScoutRank score, letting scouts and coaches find you, and keeping the platform safe (including AI-based content moderation on posts, comments, and messages).</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">3. Who can see what</h2>
          <p>Your profile, posts, and stats are visible to other users by default. Direct messages are only visible to the people in that conversation and, where relevant, to admins reviewing a report. Admins can see moderation history but not your private messages unless they're part of a report you or someone else has filed.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">4. AI processing</h2>
          <p>Posts, comments, and stat evidence are processed by AI to check for inappropriate content and to verify submitted stats. Flagged content is reviewed by a human admin before any action is taken against your account.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">5. Your rights</h2>
          <p>You can download a copy of your data at any time from Settings → Security → "Download My Data." You can request permanent deletion of your account from the same page — this is reviewed by an admin and, once approved, is genuinely permanent and can't be undone.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">6. Minors</h2>
          <p>ScoutRank is used by student athletes, some of whom are under 18. We don't knowingly collect more information from a minor than is needed to run the platform, and content involving minors is subject to the same (or stricter) moderation as any other content.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">7. Data retention</h2>
          <p>We keep your data for as long as your account is active. If your account is deleted (whether by you or after admin approval of a deletion request), your profile and associated content are permanently removed.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">8. Contact</h2>
          <p>Questions about this policy, or requests relating to your data, can be directed to ScoutRank support.</p>
        </section>
      </div>
    </div>
  );
}
