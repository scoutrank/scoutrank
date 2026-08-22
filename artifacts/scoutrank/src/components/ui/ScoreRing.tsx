import { useId } from 'react';
import { cn } from '@/utils/cn';

interface ScoreRingProps {
  /** 0.00–100.00, or null/undefined for "not yet ranked." */
  score: number | null | undefined;
  /** Diameter in px. Defaults to 64. */
  size?: number;
  /** Ring thickness in px. Defaults to ~9% of size. */
  strokeWidth?: number;
  className?: string;
}

// A circular "out of 100" progress ring for an athlete's ScoutRank score —
// the ring fills proportionally to score/100, with the score itself shown
// in the center. Unranked athletes (score === null) get an empty ring with
// no fill and a placeholder in the middle, rather than a number.
export function ScoreRing({ score, size = 64, strokeWidth, className }: ScoreRingProps) {
  const gradientId = useId();
  const sw = strokeWidth ?? Math.max(3, Math.round(size * 0.09));
  const radius = (size - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  const isRanked = score !== null && score !== undefined;
  const pct = isRanked ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const dashOffset = circumference * (1 - pct);

  return (
    <div
      className={cn('relative inline-flex items-center justify-center flex-shrink-0', className)}
      style={{ width: size, height: size }}
      title={isRanked ? `ScoutRank ${score.toFixed(2)}` : 'Not yet ranked'}
    >
      <svg width={size} height={size} className="-rotate-90" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8A3FFC" />
            <stop offset="100%" stopColor="#4EA1FF" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1A2260"
          strokeWidth={sw}
        />
        {/* Fill — only drawn once ranked, so an unranked ring is genuinely empty */}
        {isRanked && pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {isRanked ? (
          <span
            className="font-display font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-sr-silver leading-none"
            style={{ fontSize: size * 0.28 }}
          >
            {Math.round(score)}
          </span>
        ) : (
          <span
            className="text-sr-text-muted font-semibold leading-none"
            style={{ fontSize: size * 0.16 }}
          >
            NR
          </span>
        )}
      </div>
    </div>
  );
}
