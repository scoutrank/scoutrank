import { supabase } from '@/lib/supabase';
import type { AthleteStat, StatEventType } from '@/lib/supabase';

export type DNAAttribute = 'speed' | 'agility' | 'strength' | 'endurance' | 'power' | 'coordination';

export const DNA_ATTRIBUTES: { key: DNAAttribute; label: string }[] = [
  { key: 'speed', label: 'Speed' },
  { key: 'agility', label: 'Agility' },
  { key: 'strength', label: 'Strength' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'power', label: 'Power' },
  { key: 'coordination', label: 'Coordination' },
];

/**
 * Maps a stat event to a DNA attribute by keyword — a curated
 * admin-tagged mapping would be more precise, but with events varying
 * across every sport on the platform, keyword matching gets real
 * coverage today without new admin tooling. Good enough to be useful,
 * not claimed to be perfectly precise.
 */
export function eventToDNAAttribute(eventLabel: string): DNAAttribute | null {
  const l = eventLabel.toLowerCase();
  if (/sprint|dash|\d+\s*m\b|speed/.test(l)) return 'speed';
  if (/agility|shuttle|cone|change of direction/.test(l)) return 'agility';
  if (/strength|bench|squat|deadlift|press|pull-?up|push-?up/.test(l)) return 'strength';
  if (/endurance|yo-?yo|beep test|distance|mile|5k|10k|stamina|fitness test/.test(l)) return 'endurance';
  if (/vertical|jump|power|explosive|broad jump/.test(l)) return 'power';
  if (/reaction|coordination|accuracy|hand-eye|catching|juggling/.test(l)) return 'coordination';
  return null;
}

export interface DNAScore {
  attribute: DNAAttribute;
  score: number | null; // 0-100, null if no data at all
  source: 'derived' | 'self-reported' | null;
  evidence: string | null; // e.g. "3.04s 20m Sprint" — shown as supporting detail
}

/**
 * Percentile rank of a value among a set of values, respecting whether
 * higher or lower is better for that event. Returns 0-100.
 */
function percentileScore(value: number, allValues: number[], higherIsBetter: boolean): number {
  if (allValues.length <= 1) return 50; // not enough data to compare against — neutral midpoint
  const better = allValues.filter(v => (higherIsBetter ? v < value : v > value)).length;
  return Math.round((better / (allValues.length - 1)) * 100);
}

/**
 * Computes the six DNA attribute scores for one athlete — derived from
 * verified stats where a matching event exists (real percentile against
 * everyone else with verified data for that same event), falling back to
 * the athlete's own self-reported number where no derived data exists.
 */
export async function computeDNAScores(profileId: string, selfReported: Record<string, number> | null): Promise<DNAScore[]> {
  const { data: myStatsData } = await supabase
    .from('athlete_stats')
    .select('*, stat_event_types(*)')
    .eq('profile_id', profileId)
    .eq('verification_status', 'verified');
  const myStats = (myStatsData as (AthleteStat & { stat_event_types: StatEventType | null })[] | null) ?? [];

  const results: DNAScore[] = [];

  for (const { key, label } of DNA_ATTRIBUTES) {
    // This athlete's best verified result for any event matching this attribute.
    const myMatches = myStats.filter(s => s.stat_event_types && eventToDNAAttribute(s.stat_event_types.label) === key);

    if (myMatches.length === 0) {
      const selfScore = selfReported?.[key];
      results.push({
        attribute: key,
        score: typeof selfScore === 'number' ? selfScore : null,
        source: typeof selfScore === 'number' ? 'self-reported' : null,
        evidence: null,
      });
      continue;
    }

    // Pick this athlete's single best matching result (respecting direction).
    const best = myMatches.reduce((a, b) => {
      const higherIsBetter = a.stat_event_types?.higher_is_better ?? true;
      return (higherIsBetter ? b.value > a.value : b.value < a.value) ? b : a;
    });
    const eventTypeId = best.stat_event_type_id;
    const higherIsBetter = best.stat_event_types?.higher_is_better ?? true;

    // Everyone else's verified results for that exact same event, for a real comparison.
    const { data: othersData } = await supabase
      .from('athlete_stats')
      .select('value')
      .eq('stat_event_type_id', eventTypeId)
      .eq('verification_status', 'verified');
    const allValues = ((othersData ?? []) as { value: number }[]).map(r => r.value);

    results.push({
      attribute: key,
      score: percentileScore(best.value, allValues, higherIsBetter),
      source: 'derived',
      evidence: `${best.value}${best.stat_event_types?.unit ? ` ${best.stat_event_types.unit}` : ''} ${best.stat_event_types?.label ?? label}`,
    });
  }

  return results;
}
