import { Link } from 'react-router-dom';
import { ArrowLeft, Check, X, ShieldOff, AlertTriangle } from 'lucide-react';

export default function CommunityGuidelinesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-sr-silver">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <h1 className="text-2xl font-bold text-white mb-2">Community Guidelines</h1>
      <p className="text-sm text-sr-text-muted mb-8">
        ScoutRank is for showing off your game, connecting with coaches and scouts, and tracking real progress. These
        guidelines exist to keep it a place people actually want to use.
      </p>

      <div className="space-y-6">
        <section className="card-premium p-5">
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><Check className="h-4 w-4 text-green-400" /> Always okay</h2>
          <ul className="text-sm space-y-1.5 list-disc list-inside">
            <li>Normal sports contact and competitive intensity</li>
            <li>Strong-but-generic trash talk and rivalry banter</li>
            <li>Disagreeing with someone without personal attacks</li>
            <li>Normal athletic clothing/gear in your posts</li>
          </ul>
        </section>

        <section className="card-premium p-5">
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-yellow-400" /> Can get you warned</h2>
          <p className="text-sm text-sr-text-muted mb-2">First offense, account stays active — but repeat issues escalate.</p>
          <ul className="text-sm space-y-1.5 list-disc list-inside">
            <li>Trash talk that crosses into a personal attack</li>
            <li>Minor, first-time rule violations</li>
          </ul>
        </section>

        <section className="card-premium p-5">
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><ShieldOff className="h-4 w-4 text-blue-400" /> Can get you suspended or restricted</h2>
          <ul className="text-sm space-y-1.5 list-disc list-inside">
            <li>Harassment or bullying directed at a specific person</li>
            <li>Graphic violence or gore</li>
            <li>Dangerous stunts likely to be imitated by others</li>
            <li>Repeated spam</li>
          </ul>
        </section>

        <section className="card-premium p-5">
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><X className="h-4 w-4 text-red-400" /> Always leads to a ban</h2>
          <ul className="text-sm space-y-1.5 list-disc list-inside">
            <li>Sexual content involving or sexualizing minors</li>
            <li>Credible threats of violence</li>
            <li>Doxxing (sharing someone's private information without consent)</li>
            <li>Hate symbols or hate speech</li>
            <li>Content promoting self-harm or suicide</li>
          </ul>
        </section>

        <section>
          <h2 className="text-white font-semibold mb-2">How enforcement works</h2>
          <p className="text-sm">
            Posts, comments, and stat evidence are automatically scanned. Most everyday content is never flagged — the
            system is built to be conservative and let normal sports content through. Anything genuinely flagged is
            reviewed by a real person before any action is taken, and repeat issues escalate (a second offense is
            treated more seriously than a first). If action is taken on your account, you'll be told why, and you can
            dispute it directly in the app.
          </p>
        </section>
      </div>
    </div>
  );
}
