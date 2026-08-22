import { getSportIcon } from '@/lib/sports';
import { formatSportName } from '@/utils/format';

interface SportComingSoonProps {
  sport: string;
  compact?: boolean; // smaller treatment for inline use inside a form, vs. the full-page card
}

// Designed to feel intentional, not like something's missing — the
// same visual language as the rest of the stats redesign (gradient
// icon badge, premium dark surface) rather than a generic "nothing
// here" placeholder.
export function SportComingSoon({ sport, compact }: SportComingSoonProps) {
  const Icon = getSportIcon(sport);
  const label = formatSportName(sport);

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-sr-border bg-sr-surface">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center flex-shrink-0">
          <Icon className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">{label} stat tracking is coming soon</p>
          <p className="text-xs text-sr-text-muted">Check back once events for {label} have been added.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-sr-border-light bg-sr-surface p-16 text-center">
      <div className="relative h-16 w-16 mx-auto mb-5">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center">
          <Icon className="h-8 w-8 text-white" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">{label}</h3>
      <span className="inline-block text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wide bg-sr-purple/15 text-sr-purple-light mb-3">
        Coming Soon
      </span>
      <p className="text-sm text-sr-text-muted max-w-sm mx-auto">
        We're building official ScoutRank stat categories for {label}. Check back soon.
      </p>
    </div>
  );
}
