import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName, displayScoutRank } from '@/lib/supabase';
import type { Profile, ParentAthleteLink } from '@/lib/supabase';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { Button } from '@/components/ui/BrandButton';
import { formatSportName } from '@/utils/format';
import {
  Users, MapPin, Globe, Settings, ChevronRight,
  Loader2, AlertCircle, Shield, Star,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

interface LinkedAthlete {
  link: ParentAthleteLink;
  athlete: Profile;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ParentProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser, profile: currentProfile } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'children'>('overview');
  const [children, setChildren] = useState<LinkedAthlete[]>([]);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);

  const isOwner = !!currentUser && profile?.id === currentUser.id;

  useEffect(() => {
    if (!username) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setIsLoading(false); return; }
        setProfile(data as Profile);
        setIsLoading(false);
      });
  }, [username]);

  // Load children when Children tab is opened or profile loads
  useEffect(() => {
    if (!profile || activeTab !== 'children') return;
    loadChildren();
  }, [profile?.id, activeTab]);

  const loadChildren = async () => {
    if (!profile) return;
    setIsLoadingChildren(true);
    const { data: links, error: linkError } = await supabase
      .from('parent_athlete_links')
      .select('*')
      .eq('parent_profile_id', profile.id)
      .eq('status', 'approved');
    if (linkError || !links || links.length === 0) { setIsLoadingChildren(false); return; }

    const athleteIds = (links as ParentAthleteLink[]).map(l => l.athlete_profile_id);
    const { data: athletes } = await supabase.from('profiles').select('*').in('id', athleteIds);
    const athleteMap: Record<string, Profile> = {};
    for (const a of (athletes as Profile[] | null) ?? []) athleteMap[a.id] = a;

    setChildren((links as ParentAthleteLink[])
      .filter(l => athleteMap[l.athlete_profile_id])
      .map(l => ({ link: l, athlete: athleteMap[l.athlete_profile_id] })));
    setIsLoadingChildren(false);
  };

  // Check if viewer can see the children tab
  const canViewChildren = (): boolean => {
    if (!profile) return false;
    const vis = profile.children_visibility ?? 'private';
    if (vis === 'public') return true;
    if (vis === 'private') return isOwner;
    // followers_only — for now treat as owner-only until follows are wired for parents
    return isOwner;
  };

  if (isLoading) return (
    <div className="min-h-screen bg-sr-bg flex items-center justify-center">
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue animate-pulse-glow" />
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-sr-bg flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-4xl font-display font-bold gradient-text mb-4">404</h1>
        <p className="text-sr-text-muted mb-4">Profile not found</p>
        <Button variant="outline" onClick={() => navigate('/discover')}>Back to Discover</Button>
      </div>
    </div>
  );

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: Users },
    // Children tab shown to owner always; to others only if visibility allows
    ...(isOwner || canViewChildren()
      ? [{ id: 'children' as const, label: 'Children', icon: Shield }]
      : []),
  ];

  return (
    <div className="min-h-screen">
      {/* Banner — guardian-themed, distinct from athlete purple gradient */}
      <div className="h-48 sm:h-56 relative overflow-hidden">
        {profile.banner_url ? (
          <img src={profile.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-sr-bg to-sr-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-sr-bg via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_70%_40%,rgba(59,130,246,0.4),transparent_55%)]" />
        {isOwner && (
          <button onClick={() => navigate('/settings')}
            className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-black/30 backdrop-blur-sm text-white/80 hover:text-white transition-all">
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4">
        {/* Profile header */}
        <div className="relative -mt-16 sm:-mt-20 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            {/* Avatar */}
            <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-2xl border-4 border-sr-bg shadow-xl flex-shrink-0 overflow-hidden">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={fullName(profile)} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-3xl sm:text-4xl font-bold text-white">
                  {profile.first_name?.[0]}{profile.last_name?.[0]}
                </div>
              )}
            </div>

            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{fullName(profile)}</h1>
                {isOwner && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sr-purple/10 border border-sr-purple/20 text-sr-purple-light text-xs">
                    Your Profile
                  </span>
                )}
                {/* Guardian badge */}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 border border-blue-500/30 text-blue-300">
                  <Shield className="h-3 w-3" />
                  Guardian
                </span>
              </div>
              <p className="text-sm text-sr-text-muted mt-0.5">@{profile.username}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-sr-text-muted">
                {(profile.city || profile.state || profile.country) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 overflow-x-auto mb-6 border-b border-sr-border">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all -mb-px ${
                activeTab === tab.id
                  ? 'border-sr-purple text-white'
                  : 'border-transparent text-sr-text-muted hover:text-sr-silver'
              }`}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="pb-16">
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {profile.bio ? (
                <div className="card-premium p-5">
                  <h3 className="text-sm font-semibold text-sr-silver mb-2">About</h3>
                  <p className="text-sm text-sr-silver leading-relaxed">{profile.bio}</p>
                </div>
              ) : isOwner ? (
                <div className="card-premium p-5 text-center">
                  <p className="text-sm text-sr-text-muted mb-3">Add a bio so others know who you are.</p>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
                    Add Bio
                  </Button>
                </div>
              ) : null}

              {/* Owner: quick links to parent dashboard and settings */}
              {isOwner && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Link to="/parent" className="card-premium p-4 hover:border-sr-purple/30 transition-colors group flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-sr-purple-light" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white group-hover:text-sr-purple-light transition-colors">My Dashboard</p>
                      <p className="text-xs text-sr-text-muted">Manage linked athletes</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-sr-text-muted" />
                  </Link>
                  <Link to="/parent/link-requests" className="card-premium p-4 hover:border-sr-purple/30 transition-colors group flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center flex-shrink-0">
                      <Shield className="h-5 w-5 text-sr-purple-light" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white group-hover:text-sr-purple-light transition-colors">Parent Access</p>
                      <p className="text-xs text-sr-text-muted">Approve athlete links</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-sr-text-muted" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {activeTab === 'children' && (
            <div>
              {!canViewChildren() ? (
                <div className="card-premium p-12 text-center">
                  <Shield className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
                  <p className="text-white font-semibold mb-1">Private</p>
                  <p className="text-sm text-sr-text-muted">This parent's linked athletes are private.</p>
                </div>
              ) : isLoadingChildren ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-sr-purple animate-spin" />
                </div>
              ) : children.length === 0 ? (
                <div className="card-premium p-12 text-center">
                  <Users className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
                  <p className="text-white font-semibold mb-1">No Linked Athletes</p>
                  <p className="text-sm text-sr-text-muted">
                    {isOwner ? 'Link your child\'s athlete account from your dashboard.' : 'No athletes are linked to this account.'}
                  </p>
                  {isOwner && (
                    <Link to="/parent" className="mt-4 inline-block">
                      <Button variant="brand" size="sm" icon={<Users className="h-4 w-4" />}>Go to Dashboard</Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {children.map(({ athlete }) => (
                    <div key={athlete.id} className="card-premium p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-12 w-12 rounded-xl overflow-hidden flex-shrink-0">
                          {athlete.avatar_url ? (
                            <img src={athlete.avatar_url} alt={fullName(athlete)} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-sm font-bold">
                              {athlete.first_name?.[0]}{athlete.last_name?.[0]}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{fullName(athlete)}</p>
                          <p className="text-xs text-sr-text-muted">@{athlete.username}</p>
                        </div>
                      </div>

                      {/* Sports */}
                      {/* (athlete_details not fetched here for simplicity — future enhancement) */}

                      {/* ScoutRank score */}
                      {athlete.scoutrank_score != null && (
                        <div className="flex items-center gap-1.5 mb-3 text-sm">
                          <Star className="h-4 w-4 text-sr-purple-light" />
                          <span className="font-semibold text-white">{displayScoutRank(athlete.scoutrank_score)}</span>
                          <span className="text-xs text-sr-text-muted">ScoutRank Score</span>
                        </div>
                      )}

                      <VerificationBadge status={athlete.coach_scout_verification_status} role={athlete.role} size="sm" />

                      <Link to={`/profile/${athlete.username}`} className="mt-3 flex">
                        <Button variant="ghost" size="sm" className="w-full justify-center" icon={<ChevronRight className="h-4 w-4" />}>
                          View Profile
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
