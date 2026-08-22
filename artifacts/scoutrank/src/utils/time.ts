// ── Shared timestamp helpers ──────────────────────────────────────────
// Supabase timestamps may or may not include the trailing 'Z' (UTC marker).
// Without 'Z', browsers parse the string as LOCAL time (ECMA-262 §21.4.2.7),
// which causes "10 hours ago" bugs for users in UTC+10 timezones.
// parseUTC() normalises this by always forcing UTC interpretation.

function parseUTC(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  try {
    // If already has timezone info (ends with Z or +HH:MM), parse as-is.
    // Otherwise append 'Z' to force UTC interpretation.
    const normalised = /Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z';
    const d = new Date(normalised);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

const DAY_MS  = 86_400_000;
const HOUR_MS =  3_600_000;
const MIN_MS  =     60_000;

// Day-month names in Australian order (no year suffix for current year).
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/**
 * timeAgo — the primary relative-time formatter used across the app.
 *
 * Rules (Australian date order — day then month, never month then day):
 *   < 1 min  → "Just now"
 *   < 1 hr   → "X minutes ago"
 *   < 24 hr  → "X hours ago"
 *   < 7 days → "X days ago"
 *   < 14 day → "1 week ago"
 *   < 1 year → "5 January"          (no year — unambiguous within the year)
 *   ≥ 1 year → "5 January 2025"
 *
 * Future timestamps (clock skew, newly created rows) → "Just now".
 * Null/invalid input → "—".
 */
export function timeAgo(iso: string | null | undefined): string {
  const date = parseUTC(iso);
  if (!date) return '—';

  const diffMs = Date.now() - date.getTime();

  // Future or within the last second — treat as just now.
  if (diffMs < MIN_MS) return 'Just now';

  if (diffMs < HOUR_MS) {
    const mins = Math.floor(diffMs / MIN_MS);
    return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  }

  if (diffMs < DAY_MS) {
    const hrs = Math.floor(diffMs / HOUR_MS);
    return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  }

  const days = Math.floor(diffMs / DAY_MS);

  if (days < 7)  return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (days < 14) return '1 week ago';
  if (days < 21) return '2 weeks ago';
  if (days < 28) return '3 weeks ago';

  // Calendar date — Australian order (day month [year])
  const d = date.getDate();
  const m = MONTH_NAMES[date.getMonth()];
  const y = date.getFullYear();
  const thisYear = new Date().getFullYear();

  return y === thisYear ? `${d} ${m}` : `${d} ${m} ${y}`;
}

/**
 * shortDate — for non-relative contexts (event dates, joined dates, etc.)
 * Always shows the full calendar date in Australian order.
 * "5 January 2026" or "5 January" (current year).
 */
export function shortDate(iso: string | null | undefined): string {
  const date = parseUTC(iso);
  if (!date) return '—';
  const d = date.getDate();
  const m = MONTH_NAMES[date.getMonth()];
  const y = date.getFullYear();
  const thisYear = new Date().getFullYear();
  return y === thisYear ? `${d} ${m}` : `${d} ${m} ${y}`;
}

/**
 * Calculates the current age in whole years from a date-of-birth string.
 * Used for child-safety decisions — always reflects today's date, not
 * the stored profiles.age integer (which is set once at signup and never updated).
 *
 * Returns null when dob is null/undefined/unparseable — callers must
 * treat null as "unknown age = treat as minor" (fail-closed).
 */
export function calculateAgeFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
