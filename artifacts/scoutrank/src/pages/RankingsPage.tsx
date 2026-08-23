import { useState, useEffect, useMemo, useRef } from 'react';
import { shortDate } from '@/utils/time';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/BrandButton';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { formatSportName } from '@/utils/format';
import { SPORT_OPTIONS } from '@/lib/sports';
import { SportComingSoon } from '@/components/ui/SportComingSoon';
import { supabase, fullName, displayScoutRank } from '@/lib/supabase';
import type { Profile, StatEventType, AthleteStat } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { MedalIcon, TrendUpIcon, TrendDownIcon } from '@/components/icons';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { MobileFilterDrawer } from '@/components/ui/MobileFilterDrawer';
import {
  BarChart3, Trophy, Filter, Search,
  ArrowUp, ArrowDown, Minus, Share2, Sparkles, Loader2, RefreshCw,
} from 'lucide-react';

type RankingRow = { profile_id: string; sport: string; rank_score: number; division: string; profiles: Profile; poolCount: number };
type LeaderboardRow = AthleteStat & { profiles: Profile };
type RankingsView = 'score' | 'stats';


// Age group eligibility.
// Strict "Under N" rule: a player aged (N-1) has base division UN.
// A U16 athlete (age 15) is eligible for U16, U17, U18 and Open.
// When a division filter is selected, the leaderboard shows every
// base group whose athletes are eligible for that division.
const ELIGIBLE_BASE_GROUPS: Record<string, string[]> = {
  U12:  ['U12'],
  U13:  ['U12', 'U13'],
  U14:  ['U12', 'U13', 'U14'],
  U15:  ['U12', 'U13', 'U14', 'U15'],
  U16:  ['U12', 'U13', 'U14', 'U15', 'U16'],
  U17:  ['U12', 'U13', 'U14', 'U15', 'U16', 'U17'],
  U18:  ['U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18'],
  Open: ['U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Open'],
};

/**
 * Returns the age_group values that may appear in a given division filter.
 * Returns null for 'All' (no filter applied).
 */
function eligibleGroupsFor(filter: string): string[] | null {
  if (filter === 'All') return null;
  return ELIGIBLE_BASE_GROUPS[filter] ?? null;
}

export default function RankingsPage() {
  const { profile } = useAuth();
  const [view, setView] = useState<RankingsView>('score');
  const [sport, setSport] = useState('All');
  const [ageGroup, setAgeGroup] = useState('All');
  const [category, setCategory] = useState('global');
  const [searchQuery, setSearchQuery] = useState('');
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [liveRefreshTick, setLiveRefreshTick] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [shareToast, setShareToast] = useState(false);
  const [myRankScore, setMyRankScore] = useState<number | null | undefined>(undefined); // undefined=loading, null=unranked
  const [myMovement, setMyMovement] = useState<{
    posDelta: number | null; scoreDelta: number | null; newlyRanked: boolean;
  } | null>(null);

  // Score lives in `rankings`, not on `profiles` — there's no
  // `scoutrank_score`/`is_public` column on profiles to query directly.
  // Sport filter now uses the shared canonical SPORT_OPTIONS (slugs),
  // same as Signup/StatsTab/StatLeaderboard. Using .ilike (case-
  // insensitive exact match, no wildcards in the value) rather than
  // .eq deliberately — the real casing actually stored in
  // rankings.sport from before this change was never verified, and
  // guessing wrong would silently break a filter that currently works
  // for zero benefit. ageGroup/category remain UI-only for now —
  // there's no backing column for either in the real schema yet.
  useEffect(() => {
    setIsLoading(true);

    // Two separate queries avoid PostgREST !inner join issues where rows
    // are silently dropped when the embedded resource filter is applied.
    let rankQuery = supabase
      .from('rankings')
      .select('profile_id, sport, rank_score, division')
      .eq('division', viewedDivision)
      .order('rank_score', { ascending: false })
      .limit(200);
    if (sport !== 'All') rankQuery = rankQuery.ilike('sport', sport);

    rankQuery.then(async ({ data: rankData, error: rankError }) => {
      if (rankError) { console.error('Failed to load rankings:', rankError.message); setIsLoading(false); return; }
      if (!rankData || rankData.length === 0) { setRankings([]); setIsLoading(false); return; }

      const profileIds = [...new Set((rankData as { profile_id: string }[]).map(r => r.profile_id))];
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, first_name, last_name, avatar_url, role, country, state, city, scoutrank_score')
        .in('id', profileIds)
        .eq('role', 'athlete')
        // Suspended/banned athletes drop off the leaderboard entirely while
        // restricted — this filters them out before the profile lookup, so
        // their rank rows below have nothing to match and get skipped.
        .or('account_status.is.null,account_status.eq.active');

      if (profileError) { console.error('Failed to load profiles:', profileError.message); setIsLoading(false); return; }

      const profileMap = Object.fromEntries(
        ((profileData ?? []) as Profile[]).map(p => [p.id, p])
      );

      // Pool count per sport: number of distinct athletes ranked in each (sport, division).
      // Built from raw rankData (before profile filtering) for accuracy.
      const sportCountMap = new Map<string, number>();
      for (const r of (rankData as { profile_id: string; sport: string }[])) {
        // count distinct profile_ids per sport
        sportCountMap.set(r.sport, (sportCountMap.get(r.sport) ?? 0) + 1);
      }
      // The above counts rows, not distinct profile_ids. Recount using a set.
      const sportProfileSets = new Map<string, Set<string>>();
      for (const r of (rankData as { profile_id: string; sport: string }[])) {
        if (!sportProfileSets.has(r.sport)) sportProfileSets.set(r.sport, new Set());
        sportProfileSets.get(r.sport)!.add(r.profile_id);
      }
      sportProfileSets.forEach((ids, s) => sportCountMap.set(s, ids.size));

      const allRows = ((rankData as { profile_id: string; sport: string; rank_score: number; division: string }[]))
        .filter(r => profileMap[r.profile_id])
        .map(r => ({ ...r, profiles: profileMap[r.profile_id], poolCount: sportCountMap.get(r.sport) ?? 1 })) as RankingRow[];

      // Deduplicate by profile_id, keeping the row with the highest rank_score.
      // When sport = 'All', an athlete with multiple ranked sports produces one
      // row per sport in the rankings table. The displayed score must be their
      // best sport score (consistent with profiles.scoutrank_score for Open).
      // When a specific sport is selected, each athlete already has at most one
      // row, so this is a no-op in that case.
      let deduped: RankingRow[];
      if (sport === 'All') {
        const bestByProfile = new Map<string, RankingRow>();
        for (const row of allRows) {
          const existing = bestByProfile.get(row.profile_id);
          if (!existing || Number(row.rank_score) > Number(existing.rank_score)) {
            bestByProfile.set(row.profile_id, row);
          }
        }
        deduped = [...bestByProfile.values()]
          .sort((a, b) => Number(b.rank_score) - Number(a.rank_score));
      } else {
        // Sport-specific: rows are already unique per athlete (one per sport+division).
        deduped = allRows;
      }

      setRankings(deduped);
      setIsLoading(false);
    });
  }, [sport, ageGroup, liveRefreshTick]);

  // Live — new stats getting verified, punitive resets, anything that
  // changes the rankings table live-refreshes the leaderboard for
  // everyone currently looking at it. A short debounce keeps this
  // reasonable if several rows change in quick succession (a batch of
  // verifications landing at once, for example) rather than firing a
  // full re-fetch per individual row change.
  useEffect(() => {
    let debounceTimer: number | null = null;
    const channel = supabase
      .channel('rankings-live-leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rankings' }, () => {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => setLiveRefreshTick(t => t + 1), 800);
      })
      .subscribe();
    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Check whether the current athlete has any ranking at all + latest movement.
  // Uses the selected division so the badge matches the viewed leaderboard.
  const viewedDivision = (ageGroup !== 'All' && ageGroup in ELIGIBLE_BASE_GROUPS) ? ageGroup : 'Open';
  useEffect(() => {
    if (!profile || profile.role !== 'athlete') return;
    supabase.from('rankings').select('rank_score, sport')
      .eq('profile_id', profile.id).eq('division', viewedDivision)
      .order('rank_score', { ascending: false }).limit(1)
      .then(({ data }) => {
        if (!data || data.length === 0) { setMyRankScore(null); return; }
        const best = data[0] as { rank_score: number; sport: string };
        setMyRankScore(best.rank_score);
        // Movement history filtered to the same sport+division that produced
        // the displayed score, so the badge matches what's shown.
        let histQ = supabase.from('rank_history')
          .select('rank_score,previous_rank_score,leaderboard_position,previous_position')
          .eq('profile_id', profile.id).eq('division', viewedDivision)
          .eq('sport', sport !== 'All' ? sport : best.sport)
          .order('recorded_at', { ascending: false }).limit(1).maybeSingle();
        histQ.then(({ data: h }) => {
          if (!h) { setMyMovement(null); return; }
          const row = h as { rank_score: number | null; previous_rank_score: number | null; leaderboard_position: number | null; previous_position: number | null };
          setMyMovement({
            newlyRanked: row.previous_rank_score == null && row.rank_score != null,
            scoreDelta: row.rank_score != null && row.previous_rank_score != null
              ? Math.round((Number(row.rank_score) - Number(row.previous_rank_score)) * 100) / 100 : null,
            posDelta: row.leaderboard_position != null && row.previous_position != null
              ? row.previous_position - row.leaderboard_position : null,
          });
        });
      });
  }, [profile?.id, ageGroup, sport]);

  // Region filter — `category` was previously pure UI: the dropdown set it,
  // but nothing downstream ever read it, so Local/Regional/State/National
  // all silently behaved exactly like Global regardless of selection. There's
  // no dedicated "region" boundary in the schema — the only geographic data
  // on a profile is city/state/country — so this compares each athlete
  // against the CURRENT VIEWER's own location for that tier. "Regional" and
  // "State" resolve to the same comparison (same state) since there's no
  // narrower regional grouping to compare against; a real one would need its
  // own data source. Falls back to unfiltered when the viewer hasn't set the
  // relevant location field themselves, rather than showing an empty list.
  const geoUnavailable = category !== 'global' && profile != null && (
    (category === 'local' && !profile.city) ||
    ((category === 'regional' || category === 'state') && !profile.state) ||
    (category === 'national' && !profile.country)
  );
  const geoFilteredRankings = useMemo(() => {
    if (category === 'global' || !profile) return rankings;
    if (category === 'local') {
      if (!profile.city) return rankings;
      return rankings.filter(r => r.profiles.city?.toLowerCase() === profile.city!.toLowerCase());
    }
    if (category === 'regional' || category === 'state') {
      if (!profile.state) return rankings;
      return rankings.filter(r => r.profiles.state?.toLowerCase() === profile.state!.toLowerCase());
    }
    if (category === 'national') {
      if (!profile.country) return rankings;
      return rankings.filter(r => r.profiles.country?.toLowerCase() === profile.country!.toLowerCase());
    }
    return rankings;
  }, [rankings, category, profile?.city, profile?.state, profile?.country]);

  const filteredAthletes = geoFilteredRankings.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return fullName(r.profiles).toLowerCase().includes(q) || r.profiles.username.toLowerCase().includes(q);
  });

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: 'ScoutRank Rankings', url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2500);
      });
    }
  };

  const top3 = filteredAthletes.slice(0, 3);
  const rest = filteredAthletes.slice(3);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 relative">
      {shareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-sr-surface border border-sr-purple/30 rounded-xl text-sm text-white shadow-lg">
          Link copied to clipboard
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-sr-purple" />
            Rankings
          </h1>
          <p className="text-sr-text-muted mt-1">See where athletes rank across sports, age groups and regions.</p>
        </div>
        <Button variant="outline" size="sm" icon={<Share2 className="h-4 w-4" />} onClick={handleShare}>
          Share Rankings
        </Button>
      </div>

      {/* View toggle — ScoutRank Score (existing, untouched logic below)
          vs Stat Leaderboards (new). Defaults to Score so nothing about
          current behavior changes unless someone switches tabs. */}
      <div className="flex gap-2 mb-6 border-b border-sr-border">
        {([['score', 'ScoutRank Score'], ['stats', 'Stat Leaderboards']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              view === id ? 'border-sr-purple text-white' : 'border-transparent text-sr-text-muted hover:text-sr-silver'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'stats' ? <StatLeaderboard /> : (
      <>
      {/* Filters */}
      <div className="card-premium p-4 mb-6">
        {/* Mobile drawer */}
        <MobileFilterDrawer
          activeCount={(sport !== 'All' ? 1 : 0) + (ageGroup !== 'All' ? 1 : 0)}
          onClear={() => { setSport('All'); setAgeGroup('All'); }}>
          <div><label className="block text-xs text-sr-text-muted mb-1">Sport</label>
            <SearchableSelect value={sport} onChange={setSport} className="w-full" searchPlaceholder="Search sports..."
              options={[{ value: 'All', label: 'All Sports' }, ...SPORT_OPTIONS]} /></div>
          <div><label className="block text-xs text-sr-text-muted mb-1">Division</label>
            <Select value={ageGroup} onChange={setAgeGroup} className="w-full" options={[
              { value: 'All', label: 'Open (all ages)' },
              { value: 'U12', label: 'U12' }, { value: 'U13', label: 'U13' },
              { value: 'U14', label: 'U14' }, { value: 'U15', label: 'U15' },
              { value: 'U16', label: 'U16' }, { value: 'U17', label: 'U17' },
              { value: 'U18', label: 'U18' }, { value: 'Open', label: 'Open' },
            ]} /></div>
        </MobileFilterDrawer>
        {/* Desktop inline row */}
        <div className="hidden sm:flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-sr-text-muted" />
          <SearchableSelect value={sport} onChange={setSport} className="w-auto min-w-[150px]" searchPlaceholder="Search sports..."
            options={[{ value: 'All', label: 'All Sports' }, ...SPORT_OPTIONS]} />
          <Select value={ageGroup} onChange={setAgeGroup} className="w-auto min-w-[130px]" options={[
            { value: 'All', label: 'Open (all ages)' },
            { value: 'U12', label: 'U12' },
            { value: 'U13', label: 'U13' },
            { value: 'U14', label: 'U14' },
            { value: 'U15', label: 'U15' },
            { value: 'U16', label: 'U16' },
            { value: 'U17', label: 'U17' },
            { value: 'U18', label: 'U18' },
            { value: 'Open', label: 'Open' },
          ]} />
          <Select value={category} onChange={setCategory} className="w-auto min-w-[130px]" options={[
            { value: 'local', label: 'Local' },
            { value: 'regional', label: 'Regional' },
            { value: 'state', label: 'State' },
            { value: 'national', label: 'National' },
            { value: 'global', label: 'Global' },
          ]} />
          {geoUnavailable && (
            <span className="text-xs text-sr-text-muted">
              Set your {category === 'national' ? 'country' : category === 'local' ? 'city' : 'state'} in{' '}
              <Link to="/settings" className="text-sr-purple-light hover:text-white">Settings</Link> to use this filter
            </span>
          )}
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted" />
            <input className="input-dark pl-9 py-2 text-sm w-48" placeholder="Search athlete..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Unranked callout — only shown to athletes with no score */}
      {profile?.role === 'athlete' && myRankScore === null && (
        <div className="mb-6 rounded-xl border border-sr-purple/30 bg-sr-purple/10 p-4 flex items-start gap-3">
          <BarChart3 className="h-5 w-5 text-sr-purple-light flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white mb-0.5">You're not ranked yet</p>
            <p className="text-xs text-sr-text-muted">Submit a stat and get it verified by an admin — your ScoutRank score is calculated automatically from your verified results.</p>
            <div className="flex items-center gap-3 mt-2">
              <Link to={`/profile/${profile.username}?tab=stats`} className="text-xs text-sr-purple-light hover:text-white transition-colors">Go to your Stats →</Link>
            </div>
          </div>
        </div>
      )}

      {/* No manual "recalculate" control anymore — scores are computed
          automatically by AI the moment an admin verifies a stat, so
          there's nothing for the athlete to trigger by hand. */}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-sr-purple animate-spin" />
        </div>
      ) : sport !== 'All' && rankings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sr-border-light bg-sr-surface p-16 text-center">
          <div className="h-12 w-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center">
            <Trophy className="h-6 w-6 text-sr-purple-light" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No ScoutRank Score rankings yet for {formatSportName(sport)}</h3>
          <p className="text-sm text-sr-text-muted">Rankings will appear here once athletes in this sport are scored.</p>
        </div>
      ) : filteredAthletes.length === 0 ? (
        <div className="card-premium p-16 text-center">
          <Trophy className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            {rankings.length === 0 ? 'No Athletes Yet' : 'No Results Found'}
          </h3>
          <p className="text-sm text-sr-text-muted">
            {rankings.length === 0
              ? 'Rankings will appear here once athletes are scored.'
              : category !== 'global' && geoFilteredRankings.length === 0
              ? `No athletes found for your ${category} filter — try Global instead.`
              : 'Try adjusting your search.'}
          </p>
        </div>
      ) : (
        <>
          {/* Division heading */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-sr-text-muted uppercase tracking-wider">Division</span>
        <span className="text-xs font-semibold text-white px-2 py-0.5 rounded-md bg-sr-purple/15 border border-sr-purple/25">
          {viewedDivision === 'Open' ? 'Open — all ages' : `${viewedDivision} and older`}
        </span>
        {viewedDivision !== 'Open' && (
          <span className="text-xs text-sr-text-muted">
            Includes U12–{viewedDivision} athletes
          </span>
        )}
      </div>

      {/* Podium Top 3 — standard order: 2nd left, 1st centre, 3rd right */}
          {top3.length >= 1 && (() => {
            const ranked = top3.map((entry, i) => ({ entry, rank: i + 1 }));
            const first  = ranked.find(p => p.rank === 1);
            const second = ranked.find(p => p.rank === 2);
            const third  = ranked.find(p => p.rank === 3);
            const displayOrder = [second, first, third].filter(Boolean) as typeof ranked;

            const podiumStyles: Record<number, string> = {
              1: 'from-yellow-400 to-amber-500 border-yellow-500/30',
              2: 'from-slate-300 to-slate-400 border-slate-400/30',
              3: 'from-orange-500 to-orange-600 border-orange-500/30',
            };
            // Medal icons — use MedalIcon component below

            return (
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
                {displayOrder.map(({ entry, rank }) => (
                  <Link to={`/profile/${entry.profiles.username}`} key={entry.profile_id}
                    className={`card-premium p-2.5 sm:p-6 text-center relative overflow-hidden hover:border-sr-purple/30 transition-all ${rank === 1 ? 'sm:-mt-2 sm:scale-105' : ''}`}>
                    {rank === 1 && <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 to-amber-500" />}
                    <div className="flex justify-center mb-1 sm:mb-2"><MedalIcon rank={rank} size={20} /></div>
                    <div className={`h-9 w-9 sm:h-16 sm:w-16 mx-auto rounded-xl sm:rounded-2xl bg-gradient-to-br ${podiumStyles[rank]} flex items-center justify-center text-xs sm:text-xl font-bold text-white mb-1.5 sm:mb-3`}>
                      {entry.profiles.first_name?.[0]}{entry.profiles.last_name?.[0]}
                    </div>
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <h3 className="text-[11px] sm:text-sm font-bold text-white truncate max-w-full">{fullName(entry.profiles)}</h3>
                    </div>
                    <p className="text-[9px] sm:text-xs text-sr-text-muted truncate">
                      {[entry.profiles.city, entry.profiles.state].filter(Boolean).join(', ') || 'Unknown location'}
                    </p>
                    {sport === 'All' && (
                      <p className="text-[8px] sm:text-[10px] text-sr-text-muted mt-0.5 capitalize truncate">{formatSportName(entry.sport)}</p>
                    )}
                    <div className="mt-1.5 sm:mt-3">
                      <span className="text-base sm:text-2xl font-display font-bold gradient-text-brand">{displayScoutRank(entry.rank_score)}</span>
                      <div className="text-[8px] sm:text-[10px] text-sr-text-muted">ScoutRank Score</div>
                      <div className="mt-1"><TrustBadge poolCount={entry.poolCount} /></div>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })()}

          {/* Leaderboard Table */}
          <div className="card-premium overflow-hidden">
            <div className="p-4 border-b border-sr-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Trophy className="h-4 w-4 text-sr-purple" />
                {category.charAt(0).toUpperCase() + category.slice(1)} Rankings
              </h3>
              <span className="text-xs text-sr-text-muted">{filteredAthletes.length} athlete{filteredAthletes.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-sr-text-muted border-b border-sr-border">
                    <th className="p-3 pl-6 w-16">Rank</th>
                    <th className="p-3">Athlete</th>
                    <th className="p-3 hidden md:table-cell">Location</th>
                    <th className="p-3 text-right">Score</th>
                    <th className="p-3 pr-6 text-center w-20">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAthletes.map((entry, i) => {
                    const isMe = profile?.id === entry.profile_id;
                    return (
                    <tr key={entry.profile_id}
                      className={`border-b border-sr-border/50 hover:bg-sr-surface-light/50 transition-colors ${i < 3 ? 'bg-sr-surface-light/30' : ''} ${isMe ? 'bg-sr-purple/5 border-sr-purple/20' : ''}`}>
                      <td className="p-3 pl-6">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${
                            i === 0 ? 'bg-yellow-500/10 text-yellow-400' :
                            i === 1 ? 'bg-slate-400/10 text-slate-300' :
                            i === 2 ? 'bg-orange-500/10 text-orange-400' :
                            'bg-sr-surface text-sr-text-muted'
                          }`}>
                            {i < 3 ? <MedalIcon rank={i + 1} size={18} /> : `#${i + 1}`}
                          </span>
                          {isMe && myMovement && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                              myMovement.newlyRanked ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                              (myMovement.posDelta ?? 0) > 0 ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                              (myMovement.posDelta ?? 0) < 0 ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                              'text-sr-text-muted bg-sr-surface border-sr-border'
                            }`}>
                              {myMovement.newlyRanked ? 'New' :
                               (myMovement.posDelta ?? 0) > 0 ? `▲${myMovement.posDelta}` :
                               (myMovement.posDelta ?? 0) < 0 ? `▼${Math.abs(myMovement.posDelta!)}` : '—'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Link to={`/profile/${entry.profiles.username}`} className="flex items-center gap-3 group">
                          <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${
                            i < 3 ? 'from-sr-purple to-sr-blue' : 'from-sr-surface to-sr-surface-light'
                          } flex items-center justify-center text-xs font-bold text-white`}>
                            {entry.profiles.first_name?.[0]}{entry.profiles.last_name?.[0]}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-white group-hover:text-sr-purple-light transition-colors">{fullName(entry.profiles)}</p>
                            </div>
                            <p className="text-xs text-sr-text-muted">@{entry.profiles.username}</p>
                            {sport === 'All' && (
                              <p className="text-[10px] text-sr-text-muted capitalize mt-0.5">{formatSportName(entry.sport)}</p>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="p-3 text-sm text-sr-text-muted hidden md:table-cell">
                        {[entry.profiles.city, entry.profiles.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-bold text-white">{displayScoutRank(entry.rank_score)}</span>
                          <TrustBadge poolCount={entry.poolCount} />
                        </div>
                      </td>
                      <td className="p-3 pr-6 text-center">
                        <span className="inline-flex items-center gap-0.5 text-xs text-sr-text-muted">
                          {i === 0 ? <Sparkles className="h-3 w-3 text-yellow-400" /> : <Minus className="h-3 w-3" />}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// STAT LEADERBOARD
// Computed live from athlete_stats — never a stored/cached leaderboard
// table, so it can't drift out of sync with real submissions. Sorting
// direction (higher/lower is better) comes from the selected event
// type's own flag, not assumed per-sport.
// ═══════════════════════════════════════════════════
type Period = 'weekly' | 'monthly' | 'yearly' | 'all';

function StatLeaderboard() {
  const [eventTypes, setEventTypes] = useState<StatEventType[]>([]);
  const [sport, setSport] = useState(SPORT_OPTIONS[0]?.value ?? '');
  const [eventTypeId, setEventTypeId] = useState('');
  const [ageGroup, setAgeGroup] = useState('All');
  const [region, setRegion] = useState('All');
  const [period, setPeriod] = useState<Period>('all');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Stale-response guard: each filter change increments this counter.
  // The effect captures its own value; the .then() only applies its
  // results if the counter hasn't moved on since the query was fired.
  const requestIdRef = useRef(0);

  useEffect(() => {
    supabase.from('stat_event_types').select('*').order('sport').then(({ data, error }) => {
      if (error) { console.error('Failed to load event types:', error.message); return; }
      const loaded = (data as StatEventType[] | null) ?? [];
      setEventTypes(loaded);
      if (loaded.length > 0) setEventTypeId(loaded[0].id);
    });
  }, []);

  // A specific sport is always required now — stats from different sports
  // aren't comparable, so there's no meaningful "All Sports" leaderboard.
  const eventsForSport = useMemo(() => eventTypes.filter(e => e.sport === sport), [eventTypes, sport]);
  const selectedEventType = eventTypes.find(e => e.id === eventTypeId);

  // If the sport filter changes: fall back to the first event in the
  // new list if the current selection doesn't belong to it, or clear
  // the selection entirely if the new sport has no events at all.
  useEffect(() => {
    if (eventsForSport.length > 0) {
      if (!eventsForSport.some(e => e.id === eventTypeId)) {
        setEventTypeId(eventsForSport[0].id);
      }
    } else {
      setEventTypeId('');
    }
  }, [eventsForSport]);

  useEffect(() => {
    if (!eventTypeId || !selectedEventType) {
      // No valid event selected — clear stale rows immediately.
      setRows([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    // Increment counter and capture the current value for this request.
    // If another filter change fires before this .then() resolves,
    // requestIdRef.current will have advanced and this result is dropped.
    const thisId = ++requestIdRef.current;
    let active = true;

    // Only verified stats belong on a public leaderboard — the Stats tab
    // itself tells athletes a pending submission "will not affect ScoutRank
    // until approved", but this query had no status filter at all, so a
    // still-pending or even an explicitly rejected result could still rank
    // #1 with a gold medal here, ahead of genuinely verified results.
    let query = supabase
      .from('athlete_stats')
      .select('*, profiles(*)')
      .eq('stat_event_type_id', eventTypeId)
      .eq('verification_status', 'verified');

    const eligibleGroups = eligibleGroupsFor(ageGroup);
    if (eligibleGroups !== null) query = query.in('age_group', eligibleGroups);

    if (period !== 'all') {
      const cutoff = new Date();
      if (period === 'weekly') cutoff.setDate(cutoff.getDate() - 7);
      else if (period === 'monthly') cutoff.setMonth(cutoff.getMonth() - 1);
      else if (period === 'yearly') cutoff.setFullYear(cutoff.getFullYear() - 1);
      query = query.gte('event_date', cutoff.toISOString().split('T')[0]);
    }

    query
      .order('value', { ascending: !selectedEventType.higher_is_better })
      .limit(100)
      .then(({ data, error }) => {
        // Discard if a newer request has since been fired or component unmounted.
        if (!active || requestIdRef.current !== thisId) return;
        if (error) console.error('Failed to load leaderboard:', error.message);
        // Suspended/banned athletes drop off the leaderboard entirely
        // while restricted.
        const loaded = ((data as unknown as LeaderboardRow[] | null) ?? [])
          .filter(r => r.profiles?.account_status !== 'suspended' && r.profiles?.account_status !== 'banned');
        setRows(loaded);
        setIsLoading(false);
      });

    return () => { active = false; };
  }, [eventTypeId, ageGroup, period, selectedEventType?.higher_is_better]);

  // Region filter is applied client-side against the already-loaded
  // rows (small dataset per event/age-group combo) rather than fighting
  // PostgREST's embedded-resource filtering — same pattern used
  // throughout this app for filters spanning a joined table.
  // Falls back to country when an athlete hasn't set a state/province —
  // otherwise athletes without a state just vanish from every region
  // filter instead of showing up under their country.
  const regionOf = (r: LeaderboardRow) => r.profiles?.state || r.profiles?.country || null;
  const regions = useMemo(() => [...new Set(rows.map(regionOf).filter(Boolean) as string[])], [rows]);
  const filteredRows = region === 'All' ? rows : rows.filter(r => regionOf(r) === region);

  const statusStyles: Record<string, string> = {
    pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    verified: 'text-green-400 bg-green-400/10 border-green-400/20',
  };

  return (
    <div>
      {/* Filters */}
      <div className="card-premium p-4 mb-6">
        {/* Mobile drawer */}
        <MobileFilterDrawer
          activeCount={(ageGroup !== 'All' ? 1 : 0) + (region !== 'All' ? 1 : 0) + (period !== 'all' ? 1 : 0)}
          onClear={() => { setAgeGroup('All'); setRegion('All'); setPeriod('all'); }}>
          <div><label className="block text-xs text-sr-text-muted mb-1">Sport</label>
            <SearchableSelect value={sport} onChange={setSport} className="w-full" searchPlaceholder="Search sports..."
              options={SPORT_OPTIONS} /></div>
          <div><label className="block text-xs text-sr-text-muted mb-1">Event</label>
            <SearchableSelect value={eventTypeId} onChange={setEventTypeId} className="w-full" searchPlaceholder="Search events..."
              options={eventsForSport.map(e => ({ value: e.id, label: e.label }))} disabled={eventsForSport.length === 0} /></div>
          <div><label className="block text-xs text-sr-text-muted mb-1">Division</label>
            <Select value={ageGroup} onChange={setAgeGroup} className="w-full" options={[
              { value: 'All', label: 'All Ages' }, { value: 'U12', label: 'U12' },
              { value: 'U13', label: 'U13' }, { value: 'U14', label: 'U14' },
              { value: 'U15', label: 'U15' }, { value: 'U16', label: 'U16' },
              { value: 'U17', label: 'U17' }, { value: 'U18', label: 'U18' },
              { value: 'Open', label: 'Open' },
            ]} /></div>
          <div><label className="block text-xs text-sr-text-muted mb-1">Region</label>
            <Select value={region} onChange={setRegion} className="w-full"
              options={[{ value: 'All', label: 'All Regions' }, ...regions.map(r => ({ value: r, label: r }))]} /></div>
          <div><label className="block text-xs text-sr-text-muted mb-1">Period</label>
            <Select value={period} onChange={(v) => setPeriod(v as Period)} className="w-full" options={[
              { value: 'all', label: 'All-Time' }, { value: 'weekly', label: 'This Week' },
              { value: 'monthly', label: 'This Month' }, { value: 'yearly', label: 'This Year' },
            ]} /></div>
        </MobileFilterDrawer>
        {/* Desktop inline row */}
        <div className="hidden sm:flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-sr-text-muted" />
          <SearchableSelect value={sport} onChange={setSport} className="w-auto min-w-[150px]" searchPlaceholder="Search sports..."
            options={SPORT_OPTIONS} />
          <SearchableSelect value={eventTypeId} onChange={setEventTypeId} className="w-auto min-w-[170px]" searchPlaceholder="Search events..."
            options={eventsForSport.map(e => ({ value: e.id, label: e.label }))} disabled={eventsForSport.length === 0} />
          <Select value={ageGroup} onChange={setAgeGroup} className="w-auto min-w-[130px]" options={[
            { value: 'All', label: 'Open (all ages)' },
            { value: 'U12', label: 'U12' },
            { value: 'U13', label: 'U13' },
            { value: 'U14', label: 'U14' },
            { value: 'U15', label: 'U15' },
            { value: 'U16', label: 'U16' },
            { value: 'U17', label: 'U17' },
            { value: 'U18', label: 'U18' },
            { value: 'Open', label: 'Open' },
          ]} />
          <Select value={region} onChange={setRegion} className="w-auto min-w-[130px]"
            options={[{ value: 'All', label: 'All Regions' }, ...regions.map(r => ({ value: r, label: r }))]} />
          <Select value={period} onChange={(v) => setPeriod(v as Period)} className="w-auto min-w-[130px]" options={[
            { value: 'all', label: 'All-Time' },
            { value: 'weekly', label: 'This Week' },
            { value: 'monthly', label: 'This Month' },
            { value: 'yearly', label: 'This Year' },
          ]} />
        </div>{/* /desktop row */}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-sr-purple animate-spin" />
        </div>
      ) : eventsForSport.length === 0 ? (
        <SportComingSoon sport={sport} />
      ) : filteredRows.length === 0 ? (
        <div className="card-premium p-16 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Results Yet</h3>
          <p className="text-sm text-sr-text-muted">No stats recorded for this event/filter combination yet.</p>
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <div className="p-4 border-b border-sr-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Trophy className="h-4 w-4 text-sr-purple" />
              {selectedEventType && formatSportName(selectedEventType.sport)} — {selectedEventType?.label}
            </h3>
            <span className="text-xs text-sr-text-muted">{filteredRows.length} result{filteredRows.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-sr-text-muted border-b border-sr-border">
                  <th className="p-3 pl-6 w-16">Rank</th>
                  <th className="p-3">Athlete</th>
                  <th className="p-3 hidden md:table-cell">Age Group</th>
                  <th className="p-3 hidden md:table-cell">Date</th>
                  <th className="p-3 text-right">Result</th>
                  <th className="p-3 pr-6 text-center w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={row.id} className={`border-b border-sr-border/50 hover:bg-sr-surface-light/50 transition-colors ${i < 3 ? 'bg-sr-surface-light/30' : ''}`}>
                    <td className="p-3 pl-6">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${
                        i === 0 ? 'bg-yellow-500/10 text-yellow-400' :
                        i === 1 ? 'bg-slate-400/10 text-slate-300' :
                        i === 2 ? 'bg-orange-500/10 text-orange-400' :
                        'bg-sr-surface text-sr-text-muted'
                      }`}>
                        {i < 3 ? <MedalIcon rank={i + 1} size={18} /> : `#${i + 1}`}
                      </span>
                    </td>
                    <td className="p-3">
                      <Link to={`/profile/${row.profiles.username}`} className="flex items-center gap-3 group">
                        <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${i < 3 ? 'from-sr-purple to-sr-blue' : 'from-sr-surface to-sr-surface-light'} flex items-center justify-center text-xs font-bold text-white`}>
                          {row.profiles.first_name?.[0]}{row.profiles.last_name?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white group-hover:text-sr-purple-light transition-colors">{fullName(row.profiles)}</p>
                          <p className="text-xs text-sr-text-muted">@{row.profiles.username}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="p-3 text-sm text-sr-text-muted hidden md:table-cell">{row.age_group || '—'}</td>
                    <td className="p-3 text-sm text-sr-text-muted hidden md:table-cell">{shortDate(row.event_date)}</td>
                    <td className="p-3 text-right">
                      <span className="text-sm font-bold text-white">{row.value} {selectedEventType?.unit}</span>
                    </td>
                    <td className="p-3 pr-6 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusStyles[row.verification_status] || ''}`}>
                        {row.verification_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
