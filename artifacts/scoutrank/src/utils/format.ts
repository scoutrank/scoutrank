// Import time helpers first — imports must be at the top of the module.
import { timeAgo, shortDate } from '@/utils/time';
export { timeAgo, shortDate };

// Acronym sports get their conventional capitalisation; everything
// else gets title-case, word by word.
const SPORT_ACRONYMS: Record<string, string> = {
  afl: 'AFL',
  mma: 'MMA',
};

export function formatSportName(sport: string | null | undefined): string {
  if (!sport) return 'Not set';
  const lower = sport.toLowerCase();
  if (SPORT_ACRONYMS[lower]) return SPORT_ACRONYMS[lower];
  return lower
    .split(/[_\s]+/)
    .map(word => SPORT_ACRONYMS[word] || (word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

// Backward-compat wrapper — delegates to timeAgo.
export function formatRelativeDate(dateStr: string): string {
  return timeAgo(dateStr);
}
