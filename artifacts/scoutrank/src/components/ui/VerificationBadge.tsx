import { Shield, Check, Clock } from 'lucide-react';

type VerificationStatus = 'verified' | 'pending' | 'rejected' | 'revoked' | null | undefined;

interface VerificationBadgeProps {
  status: VerificationStatus;
  role: string | null | undefined;
  size?: 'sm' | 'md';
}

// Single source of truth for all three visible states:
//   🔵 Verified (gradient shield) — coach/scout has passed admin review
//   🟡 Pending   (clock)           — application submitted, not yet reviewed
//   ⬜ Unverified (outline shield)  — has not applied or was rejected/revoked
// Only shown for coach/scout accounts. Athlete profiles render nothing.
// Using ScoutRank's purple/blue gradient for "Verified" so it reads as a
// platform badge rather than a generic green checkmark.
export function VerificationBadge({ status, role, size = 'md' }: VerificationBadgeProps) {
  if (role !== 'coach' && role !== 'scout') return null;

  const isSmall = size === 'sm';

  if (status === 'verified') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full font-semibold border
        bg-gradient-to-r from-sr-purple/20 to-sr-blue/20 border-sr-purple/30 text-white
        ${isSmall ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}>
        <div className="h-3 w-3 rounded-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center flex-shrink-0">
          <Check className="h-2 w-2 text-white" strokeWidth={3} />
        </div>
        Verified {role === 'coach' ? 'Coach' : 'Scout'}
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full font-semibold border
        bg-yellow-400/10 border-yellow-400/20 text-yellow-400
        ${isSmall ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}>
        <Clock className={`${isSmall ? 'h-2.5 w-2.5' : 'h-3 w-3'} flex-shrink-0`} />
        Pending Verification
      </span>
    );
  }

  // null, rejected, revoked — all show as Unverified (not applied / rejected)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium border
      bg-sr-surface border-sr-border text-sr-text-muted
      ${isSmall ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}>
      <Shield className={`${isSmall ? 'h-2.5 w-2.5' : 'h-3 w-3'} flex-shrink-0`} />
      Unverified
    </span>
  );
}
