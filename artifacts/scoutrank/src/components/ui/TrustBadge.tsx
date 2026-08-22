/**
 * TrustBadge — communicates ScoutRank score reliability based on comparison pool size.
 *
 * Rules (must not change without a deliberate product decision):
 *   1       → Not Yet Ranked   (muted)
 *   2–4     → Provisional      (yellow)
 *   5–9     → Developing       (blue)
 *   10+     → Established      (green)
 *
 * Single source of truth — import TrustBadge and getTrustMeta from here.
 * Do not duplicate this logic in individual pages.
 */

export interface TrustMeta {
  label:   string;
  tooltip: string;
  /** Tailwind class string for text + bg + border colour */
  cls:     string;
}

export function getTrustMeta(poolCount: number): TrustMeta {
  if (poolCount <= 1) return {
    label:   'Not Yet Ranked',
    cls:     'text-sr-text-muted bg-sr-surface border-sr-border',
    tooltip: 'Only you have verified stats in this pool — score cannot yet be compared',
  };
  if (poolCount <= 4) return {
    label:   'Provisional',
    cls:     'text-yellow-400 bg-yellow-400/8 border-yellow-400/25',
    tooltip: `Provisional — based on ${poolCount} ranked athlete${poolCount !== 1 ? 's' : ''}. Fewer than 5.`,
  };
  if (poolCount <= 9) return {
    label:   'Developing',
    cls:     'text-blue-400 bg-blue-400/8 border-blue-400/25',
    tooltip: `Developing — based on ${poolCount} ranked athletes.`,
  };
  return {
    label:   'Established',
    cls:     'text-green-400 bg-green-400/8 border-green-400/25',
    tooltip: `Established — based on ${poolCount} ranked athletes.`,
  };
}

interface TrustBadgeProps {
  poolCount: number;
  className?: string;
}

export function TrustBadge({ poolCount, className = '' }: TrustBadgeProps) {
  const { label, tooltip, cls } = getTrustMeta(poolCount);
  return (
    <span
      title={tooltip}
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border cursor-help ${cls} ${className}`}>
      {label}
    </span>
  );
}
