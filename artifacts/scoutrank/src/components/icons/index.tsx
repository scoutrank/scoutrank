import type { ComponentType } from 'react';

/**
 * ScoutRank Icon Set
 * All icons follow the premium dark theme: clean geometry, 1.5px strokes,
 * sr-purple/sr-blue gradient accents where medal rank or brand emphasis is needed.
 *
 * IMPORTANT: SVG linearGradient ids must be unique per page instance.
 * Each component that uses a <defs> gradient generates a unique id via
 * the `uid` prop (defaults to the component name — override when rendering
 * multiples of the same icon on one page).
 */

interface IconProps {
  className?: string;
  size?: number;
  /** Override gradient id suffix to avoid collisions when multiple instances render */
  uid?: string;
}

// ── Medal icons ───────────────────────────────────────────────────────────────

export function GoldMedalIcon({ className, size = 20, uid = 'g' }: IconProps) {
  const id = `gold-fill-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="1st place">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>
      <path d="M9 2L12 6L15 2" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 2L7 7" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 2L17 7" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="15" r="7" fill={`url(#${id})`} />
      <circle cx="12" cy="15" r="5.5" fill="none" stroke="#F59E0B" strokeWidth="0.75" opacity="0.6" />
      <text x="12" y="19.5" textAnchor="middle" fontSize="8" fontWeight="700"
        fill="#7C3A00" fontFamily="system-ui, sans-serif">1</text>
    </svg>
  );
}

export function SilverMedalIcon({ className, size = 20, uid = 's' }: IconProps) {
  const id = `silver-fill-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="2nd place">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D1D5DB" />
          <stop offset="100%" stopColor="#9CA3AF" />
        </linearGradient>
      </defs>
      <path d="M9 2L12 6L15 2" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 2L7 7" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 2L17 7" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="15" r="7" fill={`url(#${id})`} />
      <circle cx="12" cy="15" r="5.5" fill="none" stroke="#D1D5DB" strokeWidth="0.75" opacity="0.6" />
      <text x="12" y="19.5" textAnchor="middle" fontSize="8" fontWeight="700"
        fill="#374151" fontFamily="system-ui, sans-serif">2</text>
    </svg>
  );
}

export function BronzeMedalIcon({ className, size = 20, uid = 'b' }: IconProps) {
  const id = `bronze-fill-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="3rd place">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#C2410C" />
        </linearGradient>
      </defs>
      <path d="M9 2L12 6L15 2" stroke="#FB923C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 2L7 7" stroke="#C2410C" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 2L17 7" stroke="#C2410C" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="15" r="7" fill={`url(#${id})`} />
      <circle cx="12" cy="15" r="5.5" fill="none" stroke="#FB923C" strokeWidth="0.75" opacity="0.6" />
      <text x="12" y="19.5" textAnchor="middle" fontSize="8" fontWeight="700"
        fill="#431407" fontFamily="system-ui, sans-serif">3</text>
    </svg>
  );
}

/** Convenience wrapper — renders the correct medal by rank (1/2/3). */
export function MedalIcon({ rank, size = 20, className, uid }: { rank: number; size?: number; className?: string; uid?: string }) {
  const u = uid ?? `r${rank}`;
  if (rank === 1) return <GoldMedalIcon   size={size} className={className} uid={u} />;
  if (rank === 2) return <SilverMedalIcon size={size} className={className} uid={u} />;
  if (rank === 3) return <BronzeMedalIcon size={size} className={className} uid={u} />;
  return null;
}

// ── Strength reaction icon (replaces 💪 — NOT a dumbbell) ─────────────────────
// A rising spark/bolt: energy, momentum, effort. First version of the
// ScoutRank Strength symbol — geometric, premium, purple/blue accent.

export function StrengthIcon({ className, size = 20, uid = 'str' }: IconProps) {
  const id = `strength-fill-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Strength">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* Upward lightning bolt */}
      <path d="M13 2L5 13h7l-1 9 8-11h-7l2-9Z"
        fill={`url(#${id})`} stroke={`url(#${id})`} strokeWidth="0.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Muscle reaction icon (flexed bicep — replaces 💪 literally) ───────────────
// Two states: hollow purple outline (not reacted) and a glowing purple-filled
// version (reacted). Used by MuscleReactionButton for the "boost" reaction.

// Traced directly from the user-provided reference image (contour-detected
// from the "IDLE" state icon, simplified, and fit with a smooth spline) —
// not hand-drawn, to make sure this actually matches the intended shape.
const MUSCLE_PATH =
  'M45.75,5.00 C41.34,6.04 34.25,11.57 29.63,19.33 C25.00,27.09 20.22,42.99 17.99,51.57 ' +
  'C15.75,60.15 16.34,65.67 16.19,70.82 C16.04,75.97 16.34,79.63 17.09,82.46 ' +
  'C17.84,85.30 15.37,85.75 20.67,87.84 C25.97,89.93 41.79,94.25 48.88,95.00 ' +
  'C55.97,95.75 58.13,93.96 63.21,92.31 C68.28,90.67 75.90,87.39 79.33,85.15 ' +
  'C82.76,82.91 83.06,81.34 83.81,78.88 C84.55,76.42 84.55,73.43 83.81,70.37 ' +
  'C83.06,67.31 81.87,63.36 79.33,60.52 C76.79,57.69 72.24,54.40 68.58,53.36 ' +
  'C64.93,52.31 60.67,52.76 57.39,54.25 C54.10,55.75 51.49,61.04 48.88,62.31 ' +
  'C46.27,63.58 43.36,64.48 41.72,61.87 C40.07,59.25 38.96,51.72 39.03,46.64 ' +
  'C39.10,41.57 39.93,33.96 42.16,31.42 C44.40,28.88 49.85,32.61 52.46,31.42 ' +
  'C55.07,30.22 57.24,27.31 57.84,24.25 C58.43,21.19 58.06,16.27 56.04,13.06 ' +
  'C54.03,9.85 50.15,3.96 45.75,5.00 Z';

export function MuscleIcon({ className, size = 20, uid = 'musc', filled = false }: IconProps & { filled?: boolean }) {
  const id = `muscle-fill-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Boost">
      {filled && (
        <defs>
          <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
      )}
      <path
        d={MUSCLE_PATH}
        fill={filled ? `url(#${id})` : 'none'}
        stroke={filled ? `url(#${id})` : 'currentColor'}
        strokeWidth={filled ? 3 : 6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Trophy icon (replaces 🏆) ─────────────────────────────────────────────────

export function TrophyIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Trophy">
      <path d="M8 21h8M12 17v4M7 4H5a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4h.5M17 4h2a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h-.5"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 4h10v7a5 5 0 0 1-10 0V4Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Bookmark icon (replaces 🔖) ───────────────────────────────────────────────

export function BookmarkIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Bookmark">
      <path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Comment / chat bubble (replaces 💬) ───────────────────────────────────────

export function CommentIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Comment">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Share / export (replaces 📤) ──────────────────────────────────────────────

export function ShareIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Share">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 6 12 2 8 6"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="2" x2="12" y2="15"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Link (replaces 🔗) ────────────────────────────────────────────────────────

export function LinkIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Copy link">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Location pin (replaces 📍) ────────────────────────────────────────────────

export function LocationIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Location">
      <path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// ── Verified (replaces ✅) ────────────────────────────────────────────────────

export function VerifiedIcon({ className, size = 20, uid = 'v' }: IconProps) {
  const id = `verified-fill-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Verified">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path d="M12 2l2.4 3.6L18 4l-.6 3.9L21 10l-3 2.1.6 3.9-3.6-1.6L12 18l-3-3.6-3.6 1.6.6-3.9L3 10l3.6-2.1L6 4l3.6 1.6L12 2Z"
        fill={`url(#${id})`} />
      <polyline points="9 12 11 14 15 10"
        stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Trend indicators ──────────────────────────────────────────────────────────

export function TrendUpIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Rising">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 7 22 7 22 13"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendDownIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Falling">
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 22 17 22 11"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Warning triangle (replaces ⚠) ────────────────────────────────────────────

export function WarningIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Warning">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── Fire / hot streak (replaces 🔥) ──────────────────────────────────────────

export function FireIcon({ className, size = 20, uid = 'fire' }: IconProps) {
  const id = `fire-fill-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Fire">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <path d="M8.5 14.5c0-3 2.5-4.5 2.5-7 0 0 3 2 3 5 .5-1 .5-2.5 0-4 2 1.5 3 4 3 6a6 6 0 0 1-12 0c0-2.5 1.5-4.5 1.5-4.5s.5 2 2 4.5Z"
        stroke={`url(#${id})`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Heart reaction (replaces ❤️) ─────────────────────────────────────────────

export function HeartIcon({ className, size = 20, uid = 'h' }: IconProps) {
  const id = `heart-fill-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Like">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
        fill={`url(#${id})`} />
    </svg>
  );
}

// ── Thumbs up reaction (replaces 👍) ─────────────────────────────────────────

export function ThumbsUpIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Respect">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Clap reaction (replaces 👏) ───────────────────────────────────────────────

export function ClapIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Clap">
      {/* Two hands clapping — simplified as two arcs meeting */}
      <path d="M9 12l-4-4M7.5 8.5L12 4M15 8.5L19 4M19 12l-4 4M5 15a5 5 0 0 0 7 5 5 5 0 0 0 7-5l-2-3-5 3-5-3-2 3Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Laugh reaction (replaces 😂) ──────────────────────────────────────────────

export function LaughIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Laugh">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 14s1.5 3 4 3 4-3 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Squinting eyes */}
      <path d="M9 9.5c.5-.5 1-.5 1.5 0M13.5 9.5c.5-.5 1-.5 1.5 0"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Tear drops */}
      <path d="M7.5 8l-.5-2M16.5 8l.5-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

// ── Reaction picker trigger (replaces 😊) ─────────────────────────────────────

export function ReactionIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Add reaction">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="14.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}

// ── Checkmark (replaces ✓ text) ───────────────────────────────────────────────

export function CheckmarkIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Done">
      <polyline points="20 6 9 17 4 12"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Record / personal best ─────────────────────────────────────────────────────

export function RecordIcon({ className, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Record">
      <path d="M12 2l2.4 3.6H18l-2.88 2.76 1.08 4.24L12 10.4l-4.2 2.2 1.08-4.24L6 6H9.6L12 2Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 16l3 5 3-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Reaction ID → icon component map ─────────────────────────────────────────
// Reactions are stored as IDs ('strength', 'respect', etc.) — never as emoji chars.
// This map renders the matching ScoutRank SVG component for each reaction type.

export type ReactionId = 'strength' | 'respect' | 'fire' | 'clap' | 'laugh' | 'support';

export const REACTION_ICONS: Record<ReactionId, ComponentType<{ size?: number; className?: string; uid?: string }>> = {
  strength: StrengthIcon,
  respect:  ThumbsUpIcon,
  fire:     FireIcon,
  clap:     ClapIcon,
  laugh:    LaughIcon,
  support:  HeartIcon,
};

export const REACTION_LABELS: Record<ReactionId, string> = {
  strength: 'Strength',
  respect:  'Respect',
  fire:     'Fire',
  clap:     'Clap',
  laugh:    'Laugh',
  support:  'Support',
};

export const ALL_REACTION_IDS: ReactionId[] = ['strength', 'respect', 'fire', 'clap', 'laugh', 'support'];

/** Renders the icon for a reaction id. Returns null for unknown ids. */
export function ReactionIconById({ id, size = 20, className, uid }: { id: string; size?: number; className?: string; uid?: string }) {
  const Icon = REACTION_ICONS[id as ReactionId];
  if (!Icon) return null;
  return <Icon size={size} className={className} uid={uid} />;
}
