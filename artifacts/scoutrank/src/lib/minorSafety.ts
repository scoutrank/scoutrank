import { calculateAgeFromDob } from '@/utils/time';
import type { Profile } from './supabase';

/**
 * Returns true if a minor viewer should be blocked from seeing a given
 * profile. Fails closed: null/undefined viewer age = treat as minor.
 *
 * Rule: coaches and scouts whose verification status is not 'verified'
 * are hidden from viewers under 18 (or viewers whose age is unknown).
 *
 * Does NOT block the owner from viewing their own profile — callers
 * should check isOwner separately before calling this.
 */
export function isBlockedForMinor(
  targetProfile: Pick<Profile, 'role' | 'coach_scout_verification_status'>,
  viewerProfile: Pick<Profile, 'id' | 'age'> | null | undefined,
  viewerUserId?: string | null,
): boolean {
  // Owners are never blocked.
  if (viewerUserId && viewerProfile && viewerUserId === viewerProfile.id) return false;

  // Only applies to coach/scout targets.
  const targetIsCoachOrScout =
    targetProfile.role === 'coach' || targetProfile.role === 'scout';
  if (!targetIsCoachOrScout) return false;

  // Verified coaches/scouts are always visible.
  if (targetProfile.coach_scout_verification_status === 'verified') return false;

  // Always compute from date_of_birth, not the stored age integer which
  // is set once at signup and never refreshed. Fails closed: null DOB = minor.
  const viewerAge = calculateAgeFromDob(viewerProfile?.date_of_birth);
  const viewerIsMinor = viewerAge === null || viewerAge < 18;
  return viewerIsMinor;
}

/**
 * Returns true if a conversation between two participants should be
 * blocked on child safety grounds.
 *
 * Rule is symmetric: blocks if EITHER participant is a minor (or
 * unknown age) AND the OTHER participant is an unverified coach/scout.
 * This covers both directions:
 *   - minor trying to message an unverified coach
 *   - unverified coach trying to message a minor
 */
export function isConversationBlocked(
  profileA: Pick<Profile, 'id' | 'age' | 'role' | 'coach_scout_verification_status'>,
  profileB: Pick<Profile, 'id' | 'age' | 'role' | 'coach_scout_verification_status'>,
): boolean {
  // Do NOT pass viewerUserId here — the ownership short-circuit in
  // isBlockedForMinor (viewerUserId === viewerProfile.id) would always
  // fire and return false, because in a conversation context the viewer
  // IS themselves. That guard exists only for the "owner viewing own
  // profile" case and is irrelevant here.
  const aBlockedByB = isBlockedForMinor(profileB, profileA);
  const bBlockedByA = isBlockedForMinor(profileA, profileB);
  return aBlockedByB || bBlockedByA;
}
