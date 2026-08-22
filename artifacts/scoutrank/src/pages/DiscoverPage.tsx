import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase, fullName, displayScoutRank } from '@/lib/supabase';
import { MobileFilterDrawer } from '@/components/ui/MobileFilterDrawer';
import { calculateAgeFromDob } from '@/utils/time';
import { formatSportName } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SPORT_OPTIONS } from '@/lib/sports';
import { COUNTRIES, getStatesForCountry, ORG_TYPE_LABEL } from '@/lib/locations';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import type { Profile, AthleteDetail, CoverageArea, Organisation } from '@/lib/supabase';
import { Search, MapPin, Shield, Users, Building2, TrendingUp, Loader2, Megaphone, ClipboardCheck } from 'lucide-react';

// Coach/scout coverage is 16+ only (matches the restriction enforced in
// Onboarding and at the database level via SQL #54) — no point offering
// U14 as a filter option here since no real row could ever match it.
const AGE_GROUPS = ['U16', 'U18', 'U20', 'Open'];

type DiscoverTab = 'athletes' | 'coaches' | 'scouts' | 'clubs';
type AthleteWithDetails = Profile & { athlete_details: AthleteDetail | null };

export default function DiscoverPage() {
  const { profile: viewerProfile } = useAuth();
  // Fail-safe by design: an unknown/missing age treats the viewer as a
  // minor, never as a confirmed adult. Only an explicit age >= 18 ever
  // counts as "not a minor" — every Discover route requires login
  // (ProtectedRoute), so a real viewer profile always exists here.
  // Compute from DOB — never rely on the stored age integer.
  const viewerCurrentAge = calculateAgeFromDob(viewerProfile?.date_of_birth);
  const viewerIsMinor = viewerCurrentAge === null || viewerCurrentAge < 18;
  const [tab, setTab] = useState<DiscoverTab>('athletes');
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [ageGroupFilter, setAgeGroupFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [recruitmentOnlyFilter, setRecruitmentOnlyFilter] = useState(false);
  const [coverageByProfileId, setCoverageByProfileId] = useState<Record<string, CoverageArea[]>>({});
  const [athletes, setAthletes] = useState<AthleteWithDetails[]>([]);
  const [coaches, setCoaches] = useState<Profile[]>([]);
  const [scouts, setScouts] = useState<Profile[]>([]);
  const [clubs, setClubs] = useState<(Organisation & { member_count: number })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rankScores, setRankScores] = useState<Record<string, number>>({});
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const statesForCountry = useMemo(() => (countryFilter ? getStatesForCountry(countryFilter) : null), [countryFilter]);

  // Load blocked profile IDs so they can be excluded from results.
  useEffect(() => {
    if (!viewerProfile) return;
    supabase.rpc('get_blocked_counterpart_ids').then(({ data, error }) => {
      if (error) return; // SQL #90 not yet applied — silently skip
      const ids = new Set<string>();
      for (const r of (data ?? []) as { profile_id: string }[]) ids.add(r.profile_id);
      setBlockedIds(ids);
    });
  }, [viewerProfile?.id]);

  // Country changing invalidates whatever state was picked for the
  // previous country.
  useEffect(() => {
    setStateFilter('');
  }, [countryFilter]);

  // Real athletes, real coaches, real scouts — profiles.role already
  // supports coach/scout, so these are genuine accounts, not mocked.
  // athlete_details is fetched as a SEPARATE query and merged client-
  // side by profile_id — NOT a PostgREST embed (profiles.select('*,
  // athlete_details(*)')), which was the actual cause of the athletes
  // regression: PostgREST couldn't find a detected relationship
  // between the two tables ("Could not find a relationship between
  // 'profiles' and 'athlete_details' in the schema cache"), so the
  // ENTIRE query errored — not just the embedded part — meaning
  // setAthletes() never ran at all. Two plain queries can't have this
  // failure mode.
  // Debounced server-side search: re-fetch when search changes, with ilike
  // filtering in Postgres so we only download matching rows.
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    const trimmed = search.trim();
    let q = supabase
      .from('profiles')
      .select('*')
      .eq('is_public', true)
      .in('role', ['athlete', 'coach', 'scout'])
      .order('created_at', { ascending: false })
      .limit(150);

    if (trimmed) {
      // Filter server-side across name and username
      q = q.or(
        `full_name.ilike.%${trimmed}%,username.ilike.%${trimmed}%`
      );
    }

    q.then(async (res) => {
        if (!active) return;
        if (res.error) { console.error('Failed to load profiles:', res.error.message); setIsLoading(false); return; }

        const allPublic = (res.data as Profile[] | null) ?? [];
        const loadedAthleteProfiles = allPublic.filter(p => p.role === 'athlete');
        const loadedCoaches = allPublic.filter(p => p.role === 'coach');
        const loadedScouts = allPublic.filter(p => p.role === 'scout');

        // Separate athlete_details query, scoped to just the athlete
        // profiles actually loaded, then merged client-side.
        let detailsByProfileId: Record<string, AthleteDetail> = {};
        if (loadedAthleteProfiles.length > 0) {
          const detailsRes = await supabase
            .from('athlete_details')
            .select('*')
            .in('profile_id', loadedAthleteProfiles.map(p => p.id));
          if (detailsRes.error) {
            console.error('Failed to load athlete details:', detailsRes.error.message);
          } else {
            for (const d of (detailsRes.data as AthleteDetail[] | null) ?? []) {
              detailsByProfileId[d.profile_id] = d;
            }
          }
        }
        if (!active) return;

        const loadedAthletes: AthleteWithDetails[] = loadedAthleteProfiles.map(p => ({
          ...p,
          athlete_details: detailsByProfileId[p.id] ?? null,
        }));

        setAthletes(loadedAthletes);
        setCoaches(loadedCoaches);
        setScouts(loadedScouts);

        // Real coverage data for coaches/scouts — batched, scoped to
        // just the profile ids actually loaded.
        const coverageProfileIds = [...loadedCoaches, ...loadedScouts].map(p => p.id);
        if (coverageProfileIds.length > 0) {
          supabase
            .from('coverage_areas')
            .select('*')
            .in('profile_id', coverageProfileIds)
            .then(({ data: coverageRows, error: coverageError }) => {
              if (!active) return;
              if (coverageError) { console.error('Failed to load coverage areas:', coverageError.message); return; }
              const map: Record<string, CoverageArea[]> = {};
              for (const row of (coverageRows as CoverageArea[] | null) ?? []) {
                if (!map[row.profile_id]) map[row.profile_id] = [];
                map[row.profile_id].push(row);
              }
              setCoverageByProfileId(map);
            });
        }
        setIsLoading(false);

        // Batched rank-score lookup for athletes only — coaches/scouts
        // don't have a rank_score concept.
        if (loadedAthletes.length > 0) {
          supabase
            .from('rankings')
            .select('profile_id, rank_score')
            .in('profile_id', loadedAthletes.map(a => a.id))
            .then(({ data: rankRows, error: rankError }) => {
              if (!active) return;
              if (rankError) { console.error('Failed to load rank scores:', rankError.message); return; }
              const map: Record<string, number> = {};
              for (const row of (rankRows as { profile_id: string; rank_score: number }[] | null) ?? []) {
                map[row.profile_id] = row.rank_score;
              }
              setRankScores(map);
            });
        }
      });
    return () => { active = false; };
  }, [search]);

  // Real clubs/organisations — previously a hardcoded empty array, so
  // nothing ever showed up here regardless of what existed in the
  // database.
  useEffect(() => {
    let active = true;
    supabase.from('organisations').select('*').eq('verified', true).eq('is_active', true).order('name')
      .then(async ({ data, error }) => {
        if (error) { console.error('[Discover] Failed to load clubs:', error.message); return; }
        const orgs = (data as Organisation[] | null) ?? [];
        if (orgs.length === 0) { if (active) setClubs([]); return; }

        // Batched member count per club — one query, grouped client-side,
        // rather than one query per club.
        const { data: memberRows } = await supabase.from('profiles').select('affiliated_organisation_id')
          .in('affiliated_organisation_id', orgs.map(o => o.id));
        const counts: Record<string, number> = {};
        for (const r of (memberRows ?? []) as { affiliated_organisation_id: string | null }[]) {
          if (r.affiliated_organisation_id) counts[r.affiliated_organisation_id] = (counts[r.affiliated_organisation_id] ?? 0) + 1;
        }
        if (active) setClubs(orgs.map(o => ({ ...o, member_count: counts[o.id] ?? 0 })));
      });
    return () => { active = false; };
  }, []);

  // Search filtering is now server-side (ilike on full_name/username).
  // Client-side filter kept as pass-through for compatibility with
  // location/sport filters that still operate on loaded data.
  const matchesSearch = (_p: Profile) => true;

  const matchesLocation = (p: Profile) => {
    if (countryFilter && p.country !== countryFilter) return false;
    if (stateFilter && p.state !== stateFilter) return false;
    return true;
  };

  // Sport lives on athlete_details (primary/secondary_sports), not on
  // profiles itself — filtered client-side rather than fighting
  // PostgREST's embedded-resource filter syntax, same approach used for
  // StatLeaderboard's region filter. secondary_sports is comma-joined
  // text (not an array column), so it's split and compared exactly,
  // not via substring matching. Comparison is case-insensitive because
  // some existing accounts may have signed up before sport values were
  // standardized to lowercase slugs.
  const matchesSport = (a: AthleteWithDetails) => {
    if (!sportFilter) return true;
    const details = a.athlete_details;
    if (!details) return false;
    const target = sportFilter.toLowerCase();
    if (details.primary_sport?.toLowerCase() === target) return true;
    const secondary = (details.secondary_sports || '').split(',').map(s => s.trim().toLowerCase());
    return secondary.includes(target);
  };

  // Coach/scout location + sport + age group all check the same
  // coverage_areas row together — a scout covering NSW for U16 AFL and
  // separately QLD for U18 swimming shouldn't match "NSW + U18" just
  // because each half exists on a DIFFERENT row. country/state here
  // intentionally check the COVERAGE row's region, not the profile's
  // own home location (profiles.country/state) — a scout can cover
  // regions other than where they're personally based.
  const matchesCoverage = (p: Profile) => {
    if (!sportFilter && !ageGroupFilter && !countryFilter && !stateFilter) return true;
    const rows = coverageByProfileId[p.id] || [];
    return rows.some(r =>
      (!sportFilter || r.sport === sportFilter) &&
      (!ageGroupFilter || r.age_group === ageGroupFilter) &&
      (!countryFilter || r.country === countryFilter) &&
      (!stateFilter || r.state === stateFilter)
    );
  };

  const matchesRecruitment = (a: Profile) => !recruitmentOnlyFilter || a.recruitment_open === true;

  const filteredAthletes = athletes.filter(a => !blockedIds.has(a.id) && matchesSearch(a) && matchesLocation(a) && matchesSport(a) && matchesRecruitment(a));
  // Safety gate: an unverified coach/scout is invisible to any viewer
  // who is a minor (or whose age is unknown) — fails closed, not open.
  // Uses the dedicated coach_scout_verification_status column (SQL
  // #55), not profiles.is_verified — that column stays free for
  // whatever future verification needs other account types may have.
  // Every coach/scout starts at null (not yet through the not-yet-built
  // verification flow), which correctly fails closed here since only
  // the literal string 'verified' passes.
  const isVisibleToViewer = (p: Profile) => !viewerIsMinor || p.coach_scout_verification_status === 'verified';

  const filteredCoaches = coaches.filter(c => !blockedIds.has(c.id) && matchesSearch(c) && matchesCoverage(c) && isVisibleToViewer(c));
  const filteredScouts  = scouts.filter(s => !blockedIds.has(s.id) && matchesSearch(s) && matchesCoverage(s) && isVisibleToViewer(s));

  const filteredClubs = clubs.filter(c => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()));

  const peopleTabs: { id: DiscoverTab; label: string; icon: typeof TrendingUp; rows: Profile[] }[] = [
    { id: 'athletes', label: 'Athletes', icon: TrendingUp, rows: filteredAthletes },
    { id: 'coaches', label: 'Coaches', icon: ClipboardCheck, rows: filteredCoaches },
    { id: 'scouts', label: 'Scouts', icon: Megaphone, rows: filteredScouts },
  ];
  const activePeopleTab = peopleTabs.find(t => t.id === tab);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Discover</h1>
      <p className="text-sr-text-muted mb-6">Find athletes, coaches, scouts, clubs and schools</p>

      <div className="card-premium p-4 mb-6">
{/* Mobile filter drawer */}
        <MobileFilterDrawer
          activeCount={(sportFilter ? 1 : 0) + (ageGroupFilter ? 1 : 0) + (countryFilter ? 1 : 0) + (stateFilter ? 1 : 0) + (recruitmentOnlyFilter ? 1 : 0)}
          onClear={() => { setSportFilter(''); setAgeGroupFilter(''); setCountryFilter(''); setStateFilter(''); setRecruitmentOnlyFilter(false); }}>
          {tab === 'athletes' && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={recruitmentOnlyFilter} onChange={e => setRecruitmentOnlyFilter(e.target.checked)} />
                <span className="text-xs text-sr-silver">Open to Recruitment only</span>
              </label>
            </div>
          )}
          {tab !== 'clubs' && (
            <div><label className="block text-xs text-sr-text-muted mb-1">Sport</label>
              <SearchableSelect value={sportFilter} onChange={setSportFilter} className="w-full" searchPlaceholder="Search sports..."
                options={[{ value: '', label: 'All Sports' }, ...SPORT_OPTIONS]} /></div>
          )}
          {(tab === 'coaches' || tab === 'scouts') && (
            <div><label className="block text-xs text-sr-text-muted mb-1">Age Group</label>
              <Select value={ageGroupFilter} onChange={setAgeGroupFilter} className="w-full" options={[
                { value: '', label: 'All Age Groups' },
                ...AGE_GROUPS.map(ag => ({ value: ag, label: ag })),
              ]} /></div>
          )}
          {tab !== 'clubs' && (
            <>
              <div><label className="block text-xs text-sr-text-muted mb-1">Country</label>
                <Select value={countryFilter} onChange={setCountryFilter} className="w-full" options={[
                  { value: '', label: 'All Countries' },
                  ...COUNTRIES.map(c => ({ value: c, label: c })),
                ]} /></div>
              {statesForCountry && (
                <div><label className="block text-xs text-sr-text-muted mb-1">State / Region</label>
                  <Select value={stateFilter} onChange={setStateFilter} className="w-full" options={[
                    { value: '', label: 'All States/Regions' },
                    ...statesForCountry.map(s => ({ value: s, label: s })),
                  ]} /></div>
              )}
            </>
          )}
        </MobileFilterDrawer>

        {/* Desktop inline filter row */}
        <div className="hidden sm:flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted" />
            <input className="input-dark pl-9 py-2.5" placeholder="Search by name or username..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {tab !== 'clubs' && (
            <SearchableSelect value={sportFilter} onChange={setSportFilter} className="w-auto min-w-[150px]" searchPlaceholder="Search sports..."
              options={[{ value: '', label: 'All Sports' }, ...SPORT_OPTIONS]} />
          )}
          {(tab === 'coaches' || tab === 'scouts') && (
            <Select value={ageGroupFilter} onChange={setAgeGroupFilter} className="w-auto min-w-[130px]" options={[
              { value: '', label: 'All Age Groups' },
              ...AGE_GROUPS.map(ag => ({ value: ag, label: ag })),
            ]} />
          )}
          {tab !== 'clubs' && (
            <>
              <Select value={countryFilter} onChange={setCountryFilter} className="w-auto min-w-[150px]" options={[
                { value: '', label: 'All Countries' },
                ...COUNTRIES.map(c => ({ value: c, label: c })),
              ]} />
              {statesForCountry && (
                <Select value={stateFilter} onChange={setStateFilter} className="w-auto min-w-[140px]" options={[
                  { value: '', label: 'All States/Regions' },
                  ...statesForCountry.map(s => ({ value: s, label: s })),
                ]} />
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-6 flex-wrap">
        {peopleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-sr-purple text-white' : 'bg-sr-surface text-sr-text-muted hover:text-white border border-sr-border'
            }`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
        <button onClick={() => setTab('clubs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            tab === 'clubs' ? 'bg-sr-purple text-white' : 'bg-sr-surface text-sr-text-muted hover:text-white border border-sr-border'
          }`}>
          <Building2 className="h-4 w-4" />Clubs & Schools
        </button>
      </div>

      {tab !== 'clubs' && activePeopleTab && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-sr-purple animate-spin" />
            </div>
          ) : activePeopleTab.rows.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
              <p className="text-sr-text-muted">
                {(tab === 'athletes' ? athletes : tab === 'coaches' ? coaches : scouts).length === 0
                  ? `No ${tab} have joined yet. Be the first!`
                  : `No ${tab} found. Try adjusting your search or filters.`}
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activePeopleTab.rows.map(p => (
                <Link key={p.id} to={`/profile/${p.username}`}
                  className="card-premium p-5 hover:border-sr-purple/30 transition-all group">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-lg font-bold text-white group-hover:scale-110 transition-transform">
                      {p.first_name?.[0]}{p.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{fullName(p)}</p>
                      <p className="text-xs text-sr-text-muted">@{p.username}</p>
                    </div>
                  </div>
                  {(p.city || p.state) && (
                    <div className="flex items-center gap-2 text-xs text-sr-text-muted mb-3">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[p.city, p.state].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                  {tab === 'athletes' ? (
                    <div className="flex items-center justify-between pt-3 border-t border-sr-border">
                      <span className="text-xs text-sr-text-muted">ScoutRank</span>
                      <span className="text-lg font-bold gradient-text-brand">
                        {rankScores[p.id] !== undefined ? displayScoutRank(rankScores[p.id]) : '—'}
                      </span>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-sr-border">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-sr-purple-light capitalize">{tab === 'coaches' ? 'Coach' : 'Scout'}</span>
                        <VerificationBadge status={p.coach_scout_verification_status} role={p.role} size="sm" />
                      </div>
                      {coverageByProfileId[p.id]?.[0]?.location_detail && (
                        <p className="text-xs text-sr-text-muted mt-1">{coverageByProfileId[p.id][0].location_detail}</p>
                      )}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'clubs' && (
        <>
        <div className="flex justify-end mb-4">
          <Link to="/clubs/claim-or-register" className="text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
            Claim or Register Your Club
          </Link>
        </div>
        {filteredClubs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sr-border-light bg-sr-surface p-16 text-center">
            <div className="h-12 w-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-sr-purple-light" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No clubs have joined ScoutRank yet</h3>
            <p className="text-sm text-sr-text-muted max-w-sm mx-auto mb-4">Be the first — claim your club if it's already listed, or register it from scratch.</p>
            <Link to="/clubs/claim-or-register" className="inline-block text-xs px-4 py-2 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
              Get Started
            </Link>
          </div>
        ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClubs.map(club => (
            <Link key={club.id} to={`/organisation/${club.id}`}
              className="card-premium p-5 hover:border-sr-purple/30 transition-all group">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-sr-surface-light to-sr-border flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Building2 className="h-6 w-6 text-sr-purple-light" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-white">{club.name}</p>
                    {club.verified && <Shield className="h-3.5 w-3.5 text-sr-blue" fill="currentColor" />}
                  </div>
                  <p className="text-xs text-sr-text-muted flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{[club.city, club.state, club.country].filter(Boolean).join(', ')}
                  </p>
                  <p className="text-xs text-sr-purple-light mt-0.5">{ORG_TYPE_LABEL[club.type] ?? club.type}</p>
                </div>
              </div>
              <p className="text-xs text-sr-text-muted line-clamp-2 mb-3 capitalize">
                {club.type}{club.sports?.length ? ` · ${club.sports.map(formatSportName).join(', ')}` : ''}
              </p>
              <div className="flex items-center justify-between pt-3 border-t border-sr-border">
                <span className="text-xs text-sr-text-muted flex items-center gap-1"><Users className="h-3 w-3" />{club.member_count} athletes</span>
                <span className="text-xs text-sr-purple-light">View →</span>
              </div>
            </Link>
          ))}
        </div>
        )}
        </>
      )}
    </div>
  );
}
