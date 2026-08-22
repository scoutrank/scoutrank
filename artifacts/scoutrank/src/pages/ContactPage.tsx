import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MessageCircle, Shield } from 'lucide-react';

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 text-sr-silver">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <h1 className="text-2xl font-bold text-white mb-2">Contact & Support</h1>
      <p className="text-sm text-sr-text-muted mb-8">
        Most things can be handled directly in the app — reporting a post/message, requesting your data, or requesting
        account deletion are all in Settings or right on the content itself. For anything else, reach out below.
      </p>

      <div className="space-y-4">
        <div className="card-premium p-5 flex items-start gap-3">
          <Mail className="h-5 w-5 text-sr-purple-light flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white mb-1">General support</p>
            <p className="text-sm text-sr-text-muted">For account issues, bugs, or anything not covered elsewhere.</p>
            <p className="text-sm text-sr-purple-light mt-1">info.scoutrank@gmail.com</p>
          </div>
        </div>

        <div className="card-premium p-5 flex items-start gap-3">
          <Shield className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white mb-1">Safety concerns</p>
            <p className="text-sm text-sr-text-muted">
              For anything urgent — especially concerning a minor's safety — use the in-app Report button on the
              content or account in question so it reaches our moderation team directly and fastest.
            </p>
          </div>
        </div>

        <div className="card-premium p-5 flex items-start gap-3">
          <MessageCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white mb-1">Disagree with a moderation decision?</p>
            <p className="text-sm text-sr-text-muted">
              If your account was warned, suspended, or banned, you'll see a "Dispute this decision" option right on
              that notice — that's reviewed by a different admin than the one who made the original call.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
