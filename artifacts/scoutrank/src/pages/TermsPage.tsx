import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-sr-silver">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <h1 className="text-2xl font-bold text-white mb-2">Terms of Service</h1>
      <p className="text-xs text-sr-text-muted mb-8">Last updated: {new Date().toLocaleDateString()}</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-white font-semibold mb-2">Who operates ScoutRank</h2>
          <p>ScoutRank is operated by Blaze Coppola, trading as ScoutRank (ABN 31870427228, Sole Trader). Questions about these terms can be sent to <a href="mailto:info.scoutrank@gmail.com" className="text-sr-purple-light hover:text-white">info.scoutrank@gmail.com</a>.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">Definitions</h2>
          <ul className="space-y-1.5 list-disc list-inside">
            <li><strong className="text-white">"ScoutRank," "we," "us," "our"</strong> — the operator identified above.</li>
            <li><strong className="text-white">"Platform," "App," "Website"</strong> — ScoutRank's web application and any successor domain.</li>
            <li><strong className="text-white">"User," "you"</strong> — anyone with a ScoutRank account.</li>
            <li><strong className="text-white">"Athlete"</strong> — a User whose account represents them as a participant in sport.</li>
            <li><strong className="text-white">"Coach," "Scout"</strong> — a User account type that can be granted verified status to view and message minor Athletes.</li>
            <li><strong className="text-white">"Club," "Organisation"</strong> — a User account representing a sporting club or organisation.</li>
            <li><strong className="text-white">"Marketplace," "Combine"</strong> — the part of ScoutRank where approved sellers list coaching or other services for sale to other Users.</li>
            <li><strong className="text-white">"Content," "User Content"</strong> — anything a User submits to ScoutRank, including photos, videos, posts, comments, stats, and evidence.</li>
            <li><strong className="text-white">"Verified"</strong> — see "Athlete, coach, and scout verification" below.</li>
            <li><strong className="text-white">"ScoutRank Score," "Ranking"</strong> — the score and leaderboard position calculated from a User's verified stats.</li>
            <li><strong className="text-white">"Advertiser"</strong> — a business or third party paying ScoutRank to show an ad.</li>
            <li><strong className="text-white">"Promoted content"</strong> — a User's or Organisation's own profile, post, or Combine listing that they've paid to boost the visibility of.</li>
            <li><strong className="text-white">"Sponsored content," "Paid partnership"</strong> — a User's post that promotes a business in exchange for payment or anything else of value from that business.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">1. Who can use ScoutRank</h2>
          <p className="mb-2">ScoutRank is built for athletes, coaches, scouts, and parents to track and verify sporting performance. Some of our users are under 18 — the product is specifically designed with that in mind.</p>
          <p className="mb-2">You must be at least 13 years old to create an account. If you are under 18, you confirm that a parent or guardian is aware of and consents to your use of ScoutRank, including the submission of photos and videos as evidence of your results. We may ask a parent or guardian to confirm this directly in some circumstances.</p>
          <p>Coaches and scouts who wish to be shown to minor users without restriction must complete our verification process. Until verified, minor users will not see your profile or be able to message you.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">2. Your account</h2>
          <p className="mb-2">You're responsible for the accuracy of the information on your profile and for keeping your login credentials secure. You agree to provide your real name, date of birth, and location — ScoutRank's verification system depends on this being accurate, and providing false information (including a false date of birth) may result in suspension.</p>
          <p>You may not create more than one account, impersonate another person or organisation, buy, sell, or transfer an account, or use ScoutRank on behalf of someone else without their knowledge. Creating an account that impersonates a real scout, club, or organisation is treated as a serious violation.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">3. Submitting stats and evidence</h2>
          <p className="mb-2">ScoutRank lets you submit performance results ("stats") along with supporting photo or video evidence. By submitting evidence, you confirm that the footage is genuinely of you, performing the result you're claiming, on the date stated; you have the right to submit it; and the description you provide is accurate.</p>
          <p className="mb-2">Submitted evidence is reviewed by an AI system as part of verification, and may also be reviewed by ScoutRank staff. AI review is a tool, not a guarantee — a "verified" status reflects our review process at the time, not an absolute guarantee of accuracy. We reserve the right to reverse a verification, remove a stat, or restrict an account if we later determine evidence was fraudulent or fabricated.</p>
          <p>Evidence you submit is stored securely and is only made accessible via short-lived, access-controlled links — not permanent public URLs. See our Privacy Policy for how long it's retained.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">4. ScoutRank Score and Rankings</h2>
          <p>Your ScoutRank Score and position on Rankings are calculated from your verified stats using our own scoring methodology, which may change over time as we improve it. These are our assessment, not a guarantee of ability, potential, or recruitment outcome. Coaches, scouts, and recruiters may use ScoutRank Score as one input among many — it is not a certification and should not be relied on as the sole basis for any recruitment, selection, or funding decision.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">5. Combine (the marketplace)</h2>
          <p className="mb-2">Combine lets approved sellers list items or services (such as coaching sessions) for sale to other users, with payment processed by Stripe. The seller is the party actually providing the listed service or item and is responsible for delivering it as described. ScoutRank operates the marketplace that connects buyer and seller and facilitates payment via Stripe — ScoutRank is not the seller and is not a party to the contract formed between buyer and seller for the item or service itself.</p>
          <p className="mb-2">Becoming a seller requires approval, not just passing an automated check. We may reject or revoke seller status at our discretion, including after approval.</p>
          <p className="mb-2"><strong className="text-white">Listing standards.</strong> Sellers are solely responsible for ensuring their listing is accurate and complete, and for delivering what's described. You may not list anything illegal, use Combine to solicit or arrange payment outside ScoutRank/Stripe in order to avoid fees or dispute protections, misrepresent your qualifications or affiliation with any club, school, or organisation, or guarantee a specific recruitment outcome — sporting recruitment outcomes can never be guaranteed by a service provider.</p>
          <p className="mb-2"><strong className="text-white">Reviews.</strong> Buyers may be able to leave a rating or review of a completed transaction. ScoutRank does not independently verify that a review reflects an actual completed purchase, and a review reflects the reviewer's own opinion, not ScoutRank's.</p>
          <p className="mb-2"><strong className="text-white">Fees.</strong> Any fee or commission ScoutRank charges sellers is disclosed in-app before you list or complete a purchase.</p>
          <p className="mb-2"><strong className="text-white">Minors and Combine.</strong> Only adult (18+) account holders may purchase or sell on Combine. If a listed service is intended for the benefit of a minor Athlete, the purchase must be made through a parent or guardian's account, not the minor's own account.</p>
          <p className="mb-2">Payouts are issued by ScoutRank staff and are not instant — we don't guarantee a particular payout timeline beyond what's stated in-app.</p>
          <p>Nothing in these Terms excludes, restricts, or modifies any consumer guarantee, right, or remedy under the Australian Consumer Law that cannot lawfully be excluded. Disputes between a buyer and seller are handled through our admin dispute process (buyer raises it in-app → seller responds → ScoutRank reviews and makes a final call, including refund where appropriate).</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">6. Athlete, coach, and scout verification</h2>
          <p className="mb-2">"Verified" on ScoutRank currently means one specific thing depending on account type. For an Athlete's stat, it means the submitted result and its evidence passed ScoutRank's AI-assisted review (and possibly manual staff review) — it reflects that the evidence appeared consistent with the claimed result, not a certification by any sporting body, and it can be wrong.</p>
          <p>For a Coach or Scout account, it means the account holder completed ScoutRank's verification application and was manually approved by ScoutRank staff. This does not mean ScoutRank has conducted a working-with-children check, criminal history check, or any external background check. A "verified" badge is not a guarantee that a person is trustworthy, safe, qualified, or suitable — for coaching, scouting, recruitment, or any other purpose. Parents/guardians of minor Athletes should stay involved regardless of any verified status shown.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">7. Prohibited conduct</h2>
          <p className="mb-2">You agree not to:</p>
          <ul className="space-y-1.5 list-disc list-inside">
            <li>submit fabricated, exaggerated, or misrepresented stats, evidence, or achievements;</li>
            <li>harass, bully, threaten, or send unwanted contact to another user;</li>
            <li>use ScoutRank to contact a minor for a purpose outside its intended use, or attempt to arrange contact with a minor outside the platform without appropriate safeguards;</li>
            <li>engage in sexual misconduct or exploitation, or attempt to exploit or endanger a minor in any way;</li>
            <li>discriminate against or harass another user on the basis of a protected characteristic;</li>
            <li>impersonate another person, coach, scout, club, or organisation, or create an account styled as an official representative of a real team or body when you are not one;</li>
            <li>attempt to circumvent our verification, moderation, or safety systems (including creating a new account after suspension);</li>
            <li>use bots, scripts, or automated tools to create accounts, scrape data, or interact with the platform;</li>
            <li>scrape, resell, or use ScoutRank data outside the app without permission;</li>
            <li>publish another user's private information without consent ("doxxing");</li>
            <li>buy, sell, or transfer a ScoutRank account;</li>
            <li>upload malicious code or attempt to bypass ScoutRank's security controls;</li>
            <li>submit a fraudulent or groundless report, or misuse the reporting or appeals process to harass or disadvantage another user;</li>
            <li>use the marketplace for anything illegal, fraudulent, or for goods/services outside what's permitted, or make misleading claims about recruitment outcomes when selling a service; or</li>
            <li>run an ad or promoted/sponsored content that is illegal, misleading, or targeted at minors in a way that breaches the Advertising or Paid Partnerships sections below.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">8. Minor safety measures</h2>
          <p className="mb-2">Because a meaningful portion of ScoutRank's users are under 18, several protections are built into the product itself, not just this policy:</p>
          <ul className="space-y-1.5 list-disc list-inside mb-2">
            <li>Unverified coaches and scouts are hidden from minor users, and cannot message them, until they complete our verification process.</li>
            <li>Direct messages between a minor and an unverified coach/scout are blocked in both directions.</li>
            <li>Users can set who is allowed to message them (everyone, followers only, or no one) in Settings, and can control whether their profile is publicly discoverable at all.</li>
            <li>Suspicious signup patterns and evidence submissions are logged for staff review.</li>
            <li>Reports about a profile, post, comment, or message can be submitted in-app and are reviewed by ScoutRank staff.</li>
          </ul>
          <p>These measures reduce risk but do not eliminate it — parents/guardians of minor users should stay involved in how their child uses the platform. If you believe a minor is at risk, contact us immediately at <a href="mailto:info.scoutrank@gmail.com" className="text-sr-purple-light hover:text-white">info.scoutrank@gmail.com</a>, and contact local authorities if there is immediate danger.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">9. Reporting and moderation</h2>
          <p>Users can report a profile, post, comment, message, club, coach, scout, or marketplace listing through ScoutRank's in-app reporting tools. Once a report is submitted, ScoutRank may investigate, remove content, restrict an account, suspend an account, or take no action, at our discretion, and may preserve relevant information where legally appropriate (including for law enforcement). Misusing this process is itself a violation of these Terms.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">10. Account suspension and termination</h2>
          <p className="mb-2">We may suspend, restrict, or ban an account that violates these terms, submits fraudulent evidence, engages in fraud or payment abuse, poses a safety risk to others, or repeatedly breaches these terms — with or without prior notice, depending on severity. Suspended/restricted/banned users can see the reason and any supporting evidence via their account status page. You may appeal a decision by contacting <a href="mailto:info.scoutrank@gmail.com" className="text-sr-purple-light hover:text-white">info.scoutrank@gmail.com</a>; an appeal does not guarantee the decision will be reversed.</p>
          <p>You may delete your account at any time via Settings. Deleting your account does not mean every piece of your data is immediately and permanently erased — see our Privacy Policy for what's retained, for how long, and why.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">11. Content you post</h2>
          <p className="mb-2">You retain ownership of photos, videos, posts, and comments you submit to ScoutRank — ScoutRank does not claim ownership of your content. By posting, you grant ScoutRank a limited licence to host, store, display, reproduce (including resizing/reformatting for the app), back up, distribute, and create derivative works from your content — including generating AI-assisted outputs based on your data, such as the AI-generated athlete resume/overview feature — within the app and per your visibility settings, for as long as your account and that content exist. This licence is sublicensable solely to the extent needed for our infrastructure and service providers to technically operate the app, and to moderate content as needed to enforce these Terms. This licence does not transfer ownership of your content to ScoutRank or any third party, and does not extend to using your content for advertising or promotion outside the app without your separate permission.</p>
          <p className="mb-2"><strong className="text-white">Feedback:</strong> if you send us ideas, suggestions, or feedback about ScoutRank, you agree we can use them without owing you anything, and without any obligation to keep them confidential.</p>
          <p>You may not post content that is illegal, harassing, sexually explicit, or that exploits, endangers, or exposes a minor to harm. You must not upload content you don't have the right to use. We will remove violating content and may suspend or ban the account responsible, including reporting to authorities where legally required.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">12. ScoutRank's own intellectual property</h2>
          <p>Separately from your content: the ScoutRank name, logo, app design, user interface, source code, databases, scoring methodology, and branding are owned by ScoutRank and are not licensed to you beyond what's needed to use the app normally. You may not copy, reverse-engineer, or reuse them without permission.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">13. Advertising and promoted content</h2>
          <p className="mb-2">ScoutRank may show advertising from third-party Advertisers, and may let Users or Organisations pay to boost the visibility of their own profile, post, or Combine listing ("promoted content").</p>
          <p className="mb-2"><strong className="text-white">Labelling.</strong> All paid placements and boosted/promoted content are clearly and conspicuously labelled as such (for example, "Ad," "Sponsored," or "Promoted") so it isn't mistaken for organic content or a ScoutRank endorsement. Showing an ad or promoted listing does not mean ScoutRank endorses the Advertiser, product, or service.</p>
          <p className="mb-2"><strong className="text-white">No behavioural ad targeting for minors.</strong> For Users under 18, ads are limited to broad age and location information only. ScoutRank does not use a minor's activity, interests, follows, messages, or other behavioural data to select which ads they see, and does not build advertising profiles of minor Users.</p>
          <p className="mb-2"><strong className="text-white">Restricted ad categories for minors.</strong> Regardless of what a given ad network or Advertiser might otherwise be permitted to show elsewhere, ScoutRank will not display alcohol, gambling, dating, or weight-loss/body-transformation/supplement advertising to any User under 18.</p>
          <p><strong className="text-white">Advertiser responsibilities.</strong> Advertisers are solely responsible for the accuracy and legality of their ads, and must comply with Australian Consumer Law and any applicable advertising standards. ScoutRank may reject, remove, or restrict any ad or promoted content at our discretion, including after it has been approved.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">14. Paid partnerships and sponsored content</h2>
          <p className="mb-2">If you receive payment, free or discounted products, or anything else of value from a business in exchange for promoting that business in content you post on ScoutRank, you must clearly disclose that relationship — for example using "#ad," "#sponsored," "#paidpartnership," or a ScoutRank-provided disclosure tag if one is available — in a way that's obvious to anyone viewing the post, not buried or hidden. This applies whether you were paid in cash or simply given a free product.</p>
          <p className="mb-2"><strong className="text-white">Minors and sponsorships.</strong> If you are under 18, you need your parent or guardian's consent before entering into any paid partnership or sponsorship arrangement promoted through ScoutRank, and we may ask for confirmation of that consent.</p>
          <p>ScoutRank does not review or verify sponsorship disclosures for accuracy, and is not a party to the arrangement between you and the business — you are solely responsible for complying with your own disclosure obligations under Australian Consumer Law.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">15. Disclaimers and limitation of liability</h2>
          <p className="mb-2">ScoutRank is provided "as is." We do not guarantee that verification, scoring, or rankings are error-free, that the marketplace will result in a successful transaction, or that using ScoutRank will lead to any particular recruitment, selection, scholarship, or employment outcome, or improved athletic performance. ScoutRank does not provide coaching advice unless a specific paid coaching service is being delivered through Combine, and does not endorse any individual marketplace seller, Advertiser, or sponsor.</p>
          <p>To the maximum extent permitted by law, ScoutRank and its founders are not liable for indirect, incidental, or consequential damages arising from use of the platform, including in relation to third-party services, user content, marketplace transactions, advertising, sponsored content, or security incidents. Nothing in this section limits liability that cannot be excluded under Australian Consumer Law.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">16. Third-party services</h2>
          <p>ScoutRank uses third-party services (including Stripe for payments and others listed in our Privacy Policy) and may link to external sites. ScoutRank is not responsible for the content, security, or practices of third-party sites or services you access through or alongside ScoutRank, including any Advertiser or sponsor whose ad or sponsored content appears on ScoutRank.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">17. Changes to these terms</h2>
          <p>We may update these terms as ScoutRank grows. We'll notify users of material changes in-app before they take effect.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">18. Governing law and disputes</h2>
          <p>These terms are governed by the laws of Queensland, Australia. Nothing here limits your rights under Australian Consumer Law. Before pursuing formal action, we encourage users to raise a concern with us directly using the contact details below so we can try to resolve it.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">19. Severability and entire agreement</h2>
          <p>If any part of these terms is found invalid or unenforceable, the rest continues to apply. These terms, together with our <Link to="/privacy" className="text-sr-purple-light hover:text-white">Privacy Policy</Link>, are the entire agreement between you and ScoutRank regarding your use of the platform.</p>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">20. Contact</h2>
          <p>Questions about these terms, safety concerns involving a minor, and privacy questions can all be sent to <a href="mailto:info.scoutrank@gmail.com" className="text-sr-purple-light hover:text-white">info.scoutrank@gmail.com</a>.</p>
        </section>
      </div>
    </div>
  );
}
