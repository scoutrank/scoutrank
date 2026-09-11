import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-sr-silver">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <h1 className="text-2xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-xs text-sr-text-muted mb-8">Last updated: 11 September 2026 — reviewed by Coast Legal</p>
      <p className="text-sm text-sr-text-muted mb-8">Operated by Blaze Coppola, trading as ScoutRank (ABN 31870427228, Sole Trader).</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-white font-semibold mb-2">1. What we collect</h2>
          <div className="space-y-2">
            <p><strong className="text-white">Account information:</strong> name, username, email, password/authentication data, date of birth, and location — collected at signup and used to run the platform (verification, age-appropriate visibility rules, and matching athletes to the right competitions).</p>
            <p><strong className="text-white">Profile content:</strong> avatar and banner photos, bio, and anything else you choose to add to your profile (academic info, injury history, self-reported athletic attributes) — these fields are optional. Some of this, like injury history, is sensitive information under Australian privacy law — see section 4a below.</p>
            <p><strong className="text-white">Performance data:</strong> stats you submit (event, value, date, competition level), and the photo or video evidence you attach to support them.</p>
            <p><strong className="text-white">AI-processed evidence:</strong> photos and videos submitted as evidence are sent to a third-party AI service (Anthropic's Claude, used for fraud/authenticity review) to check they genuinely show you achieving the claimed result.</p>
            <p><strong className="text-white">AI-generated outputs:</strong> if you use features like the AI-generated athlete resume/overview, your profile and stat data is processed to produce that output. The generated document is yours, same as your other content.</p>
            <p><strong className="text-white">Social activity:</strong> posts, comments, reactions, follows, and direct messages you send through ScoutRank.</p>
            <p><strong className="text-white">Marketplace data (Combine):</strong> listings you create, and — if you buy or sell — order details. Payment card information itself is handled entirely by Stripe; ScoutRank never sees or stores your card number. We do store the transaction record (amount, status, timestamps).</p>
            <p><strong className="text-white">Advertising and promotion data:</strong> if you view an ad or a boosted/promoted listing, we may log that it was shown and whether you interacted with it, so we can report basic performance to the Advertiser or the User who paid to promote it. For Users under 18, ad selection uses only your age and broad location — never your activity, interests, follows, messages, or other behavioural data. See section 8a below.</p>
            <p><strong className="text-white">Phone number (optional):</strong> if you choose to add a phone number in Settings, it's stored separately from your public profile and never shown to other users.</p>
            <p><strong className="text-white">Technical data:</strong> IP address at signup (used only to flag likely duplicate accounts evading a ban), and standard error/crash reports when something goes wrong in the app.</p>
            <p><strong className="text-white">Moderation records:</strong> if your account is restricted, suspended, or banned, or you submit or are the subject of a report, we keep a record of the reason, any supporting evidence, and who made the decision.</p>
          </div>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-3">2. Why we collect each category</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-white">Data</TableHead>
                <TableHead className="text-white">Why we collect it</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell>Email, password</TableCell><TableCell>Account authentication and login</TableCell></TableRow>
              <TableRow><TableCell>Date of birth</TableCell><TableCell>Age-eligibility checks and minor-safety visibility rules</TableCell></TableRow>
              <TableRow><TableCell>Name, username, location</TableCell><TableCell>Running your profile, matching you to the right rankings/competitions</TableCell></TableRow>
              <TableRow><TableCell>Performance stats & evidence</TableCell><TableCell>Verification, ScoutRank Score, Rankings</TableCell></TableRow>
              <TableRow><TableCell>Ad impressions/interactions</TableCell><TableCell>Reporting basic ad/promotion performance; not used to profile minors</TableCell></TableRow>
              <TableRow><TableCell>Phone number (optional)</TableCell><TableCell>Account contact</TableCell></TableRow>
              <TableRow><TableCell>Payment/transaction records</TableCell><TableCell>Processing and recording Combine purchases</TableCell></TableRow>
              <TableRow><TableCell>IP address at signup</TableCell><TableCell>Detecting likely ban-evasion, not automated blocking</TableCell></TableRow>
              <TableRow><TableCell>Crash/error reports</TableCell><TableCell>Diagnosing and fixing bugs</TableCell></TableRow>
              <TableRow><TableCell>Moderation records</TableCell><TableCell>Supporting suspension/ban decisions and appeals</TableCell></TableRow>
            </TableBody>
          </Table>
          <p className="mt-3">We do not sell your personal information to third parties, and we do not use your evidence photos/videos for anything beyond verifying the specific stat they were submitted for.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">3. Who we share it with</h2>
          <ul className="space-y-1.5 list-disc list-inside mb-2">
            <li><strong className="text-white">Stripe</strong> — processes Combine payments.</li>
            <li><strong className="text-white">Supabase</strong> — hosts our database, authentication, and file storage.</li>
            <li><strong className="text-white">Anthropic (Claude)</strong> — receives evidence photos/video frames for automated fraud-review, and stat details for AI scoring. Not used by Anthropic to train their models under their current API terms.</li>
            <li><strong className="text-white">Vercel</strong> — hosts the ScoutRank web app itself.</li>
            <li><strong className="text-white">Groq</strong> — processes Scout Bot AI-coach conversations (the free chat feature) and evidence-review requests.</li>
            <li><strong className="text-white">Advertising partners</strong> — we haven't yet selected an ad-serving partner; once we do, we'll name it here and describe what data, if any, is shared with it.</li>
            <li><strong className="text-white">Other users</strong> — your profile, posts, and stats are visible to other users according to your visibility settings.</li>
            <li><strong className="text-white">Law enforcement or authorities</strong> — only where legally required, or where we believe it's necessary to prevent harm to a minor or another person.</li>
          </ul>
          <p>We do not share your data with data brokers, and ScoutRank does not sell personal information to advertisers — an Advertiser or a User who paid to promote content may receive aggregate, non-identifying performance data (e.g. how many people saw it), never your individual profile or contact details, without your separate consent.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">4. Overseas disclosure</h2>
          <p>Several of the providers above (Stripe, Supabase, Anthropic, Vercel, Groq, and any future ad-network partner) are based overseas or operate infrastructure outside Australia, which means Australian users' personal information may be disclosed overseas as part of running the platform.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">4a. Sensitive information</h2>
          <p className="mb-2">Some information ScoutRank may hold counts as sensitive information under the Privacy Act 1988 (Cth), which generally requires your express consent to collect. Under Australian law, sensitive information includes: health information, racial or ethnic origin, political opinions, religious beliefs or affiliations, philosophical beliefs, sexual orientation or practices, criminal record, genetic information, biometric information, and membership of a professional or trade association or trade union.</p>
          <p className="mb-2">The clearest example on ScoutRank today: the optional "injury history" field in your profile is health information, and is treated as sensitive information, not ordinary profile data.</p>
          <p>By choosing to fill in this field, you consent to ScoutRank collecting and storing it as described in this policy. You don't have to fill it in — it's optional, and leaving it blank doesn't affect your ability to use ScoutRank's core features.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">5. Evidence photos and videos specifically</h2>
          <p className="mb-2">Because this is the most sensitive category of data ScoutRank handles — and because it often includes images of minors — it gets its own section rather than being folded into the general list above.</p>
          <p className="mb-2">Evidence is stored in a private, access-controlled location, not a permanent public link. When you or an admin needs to view it, the app generates a short-lived signed link rather than exposing a link that works forever. Evidence is only sent to our AI review provider for the specific purpose of checking that submission — it is not used to build a database of images, and it is not shared with other users beyond what's needed to display your own stat on your own profile.</p>
          <p>If a stat and its evidence are deleted, the underlying files are deleted from storage, not just hidden.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">6. Public profiles, search visibility, and messaging</h2>
          <ul className="space-y-1.5 list-disc list-inside mb-2">
            <li><strong className="text-white">Public Profile toggle</strong> — controls whether your profile can be discovered by coaches and scouts in Discover. Default is on.</li>
            <li><strong className="text-white">Show Rankings / Show Stats toggles</strong> — separately control whether your rankings and stats specifically are visible to other visitors.</li>
            <li><strong className="text-white">Who Can Message Me</strong> — everyone, only people who follow you, or no one.</li>
            <li><strong className="text-white">Parents</strong> have an additional "Children Visibility" setting controlling who can see their linked athlete accounts.</li>
          </ul>
          <p className="mb-2">ScoutRank's site is currently configured to allow indexing by search engines (Google, Bing, etc.).</p>
          <p>Direct messages are stored to allow both parties to see conversation history and to support moderation/reporting. Unverified coaches/scouts are blocked from messaging minors in both directions. We do not currently offer end-to-end encryption for messages — ScoutRank can access message content where necessary for safety investigations or legal requirements.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">7. Minors' privacy</h2>
          <p className="mb-2">A meaningful share of ScoutRank's users are under 18. In addition to the platform-level protections described in our Terms of Service:</p>
          <ul className="space-y-1.5 list-disc list-inside">
            <li>Minors (and all users) can control profile visibility, rankings/stats visibility, and who can message them via Settings.</li>
            <li>We do not knowingly collect more information about a minor than is needed to run the platform's core features.</li>
            <li>Ads shown to a minor are never based on their activity, interests, or behaviour — see section 8a below.</li>
            <li>A parent or guardian who wants to review, correct, or request deletion of their child's data can contact us at <a href="mailto:info.scoutrank@gmail.com" className="text-sr-purple-light hover:text-white">info.scoutrank@gmail.com</a> — we will verify the request is genuinely from a parent/guardian before acting on it.</li>
            <li>If you believe a minor's data has been mishandled or a minor is at risk, contact <a href="mailto:info.scoutrank@gmail.com" className="text-sr-purple-light hover:text-white">info.scoutrank@gmail.com</a> immediately.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">8. Cookies and technical data</h2>
          <p>ScoutRank uses essential session/authentication cookies needed to keep you logged in — these aren't optional and aren't used for advertising or tracking. Our error-monitoring tool may set technical identifiers needed to group related crash reports; it does not track you for marketing purposes. ScoutRank does not currently use third-party ad-tracking cookies, and does not currently run analytics beyond what's described here.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">8a. Advertising, promoted content, and minors</h2>
          <p className="mb-2">ScoutRank may show advertising from third-party Advertisers, and may let Users pay to boost the visibility of their own profile, post, or Combine listing. See our Terms of Service for the full advertising policy, including labelling and restricted ad categories.</p>
          <ul className="space-y-1.5 list-disc list-inside">
            <li><strong className="text-white">For Users under 18, ad targeting uses only age and broad location.</strong> We do not use a minor's activity, interests, follows, messages, or other behavioural data to select ads, and we do not build an advertising profile of a minor User.</li>
            <li><strong className="text-white">We do not share your individual profile or contact details with an Advertiser.</strong> An Advertiser or a User who paid to promote content may receive aggregate, non-identifying reporting, not information about who specifically saw or clicked it.</li>
            <li><strong className="text-white">Age-assurance data is not repurposed for advertising.</strong> If we collect information specifically to verify your age, we don't reuse that information for ad targeting without asking you separately first.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">9. Profiling, ScoutRank Score, and automated processing</h2>
          <p>ScoutRank Score and Rankings are calculated from your verified stats using an automated scoring methodology. This is used to power the app's core rankings and discovery features, not to make decisions about your account status — verification/suspension decisions involve a person, not just the score.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">10. How long we keep data</h2>
          <ul className="space-y-1.5 list-disc list-inside">
            <li><strong className="text-white">Active account data</strong> (profile, stats, evidence, posts) is kept for as long as your account is active.</li>
            <li><strong className="text-white">Evidence files</strong> tied to a deleted stat are deleted from storage at the time of deletion.</li>
            <li><strong className="text-white">Moderation records</strong> are retained even after an account is deleted or a restriction ends, since they document a past decision.</li>
            <li><strong className="text-white">Transaction/payment records</strong> are retained for the period required for accounting and tax purposes.</li>
            <li><strong className="text-white">Security logs</strong> are retained for a defined period tied to debugging usefulness, not indefinitely.</li>
            <li><strong className="text-white">Deleted accounts:</strong> most personal data is removed after your account is deleted, except where we're required to keep it longer (for example, financial and moderation records, as described above).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">11. Your rights</h2>
          <p>You can access and update most of your information directly in Settings. You can request a copy of your data, ask us to correct inaccurate information, or ask us to delete your account by contacting <a href="mailto:info.scoutrank@gmail.com" className="text-sr-purple-light hover:text-white">info.scoutrank@gmail.com</a>. Some information may be retained after a deletion request where we're legally required to keep it, or where it's part of an active moderation record.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">12. Privacy complaints</h2>
          <p>If you have a concern about how ScoutRank handles your personal information, contact <a href="mailto:info.scoutrank@gmail.com" className="text-sr-purple-light hover:text-white">info.scoutrank@gmail.com</a> with details. We will investigate and respond. If you're not satisfied with our response, or you're in Australia, you can lodge a complaint with the Office of the Australian Information Commissioner (OAIC).</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">13. Data breach response</h2>
          <p>ScoutRank maintains an internal process for identifying, containing, and investigating potential data breaches, and for determining whether notification to affected users and/or the OAIC is required under the Notifiable Data Breaches scheme.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">14. Third-party links and services</h2>
          <p>When you interact with a third-party service through ScoutRank (for example, being redirected to Stripe's checkout, or clicking through an ad), that service's own privacy policy applies to what happens there. ScoutRank isn't responsible for third-party privacy practices outside our own systems.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">15. Security</h2>
          <p>We store evidence and personal data using Supabase's infrastructure, with row-level security controls restricting who can access what, and signed (not permanent) URLs for evidence access. No system is perfectly secure, and we can't guarantee absolute security — but we treat evidence and account data as sensitive by design, not as an afterthought.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">16. Changes to this policy</h2>
          <p>We'll notify users in-app of material changes before they take effect.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">17. Contact</h2>
          <p>General privacy questions, parent/guardian data requests, and safety concerns involving a minor can all be sent to <a href="mailto:info.scoutrank@gmail.com" className="text-sr-purple-light hover:text-white">info.scoutrank@gmail.com</a>.</p>
        </section>
      </div>
    </div>
  );
}
