import { Link } from 'react-router-dom';
import type { Profile } from '@/lib/supabase';
import { isBlockedForMinor } from '@/lib/minorSafety';

interface SafeProfileLinkProps {
  /** The profile being linked to. */
  targetProfile: Pick<Profile, 'id' | 'username' | 'role' | 'coach_scout_verification_status'>;
  /** The currently logged-in user's profile. Null for logged-out users. */
  viewerProfile: Pick<Profile, 'id' | 'age'> | null | undefined;
  /** The logged-in user's auth UID (to detect ownership). */
  viewerUserId?: string | null;
  className?: string;
  children: React.ReactNode;
}

/**
 * Renders a `<Link to="/profile/:username">` when safe to do so,
 * or a non-clickable `<span>` when the viewer is (or may be) a minor
 * and the target is an unverified coach or scout.
 *
 * Use this everywhere in place of bare `<Link to="/profile/:username">`.
 * The gate logic lives in `src/lib/minorSafety.ts`.
 */
export function SafeProfileLink({
  targetProfile,
  viewerProfile,
  viewerUserId,
  className = '',
  children,
}: SafeProfileLinkProps) {
  const blocked = isBlockedForMinor(targetProfile, viewerProfile, viewerUserId);

  if (blocked) {
    // Render non-interactive — same visual slot, but no navigation.
    // Does not say "blocked" here; that messaging lives on the full
    // profile page if someone navigates there directly.
    return <span className={className}>{children}</span>;
  }

  return (
    <Link to={`/profile/${targetProfile.username}`} className={className}>
      {children}
    </Link>
  );
}
