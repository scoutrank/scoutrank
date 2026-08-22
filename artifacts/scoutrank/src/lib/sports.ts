import { formatSportName } from '@/utils/format';
import { Waves, Footprints, Target, type LucideIcon } from 'lucide-react';

// Single source of truth for sport selection across the app. Values are
// clean, stable slugs (what actually gets stored); display labels are
// derived from formatSportName, never duplicated here — adding a new
// sport later means adding one string to this array, nowhere else.
export const SPORT_VALUES = [
  'afl',
  'rugby_league',
  'rugby_union',
  'american_football',
  'soccer',
  'basketball',
  'netball',
  'swimming',
  'athletics',
  'cricket',
  'tennis',
  'golf',
  'volleyball',
  'baseball',
  'hockey',
  'field_hockey',
  'surfing',
  'boxing',
  'mma',
  'cycling',
  'rowing',
  'gym',
  'other',
] as const;

export type SportValue = typeof SPORT_VALUES[number];

export const SPORT_OPTIONS = SPORT_VALUES.map(value => ({ value, label: formatSportName(value) }));

// Generic-but-fitting icons per sport — lucide doesn't have literal
// sport-specific icons (no AFL ball, no basketball), so these map to
// the closest reasonable concept. Deliberately NOT exhaustive — every
// sport not listed here, including any added later, falls back to
// Target automatically. A new sport never breaks this, it just doesn't
// have a bespoke icon yet, which is the correct default behavior.
const SPORT_ICONS: Partial<Record<string, LucideIcon>> = {
  swimming: Waves,
  athletics: Footprints,
};

export function getSportIcon(sport: string): LucideIcon {
  return SPORT_ICONS[sport.toLowerCase()] || Target;
}
