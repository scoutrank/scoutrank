import { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/BrandButton';
import { supabase, fullName, displayScoutRank, displayRole } from '@/lib/supabase';
import { triggerPostModeration } from '@/lib/postModeration';
import { TrendUpIcon, TrendDownIcon } from '@/components/icons';
import { getTrustMeta, TrustBadge } from '@/components/ui/TrustBadge';
import { ScoreRing } from '@/components/ui/ScoreRing';
import type { Profile, Post, ClubInvite, Organisation } from '@/lib/supabase';
import {
  BarChart3, TrendingUp, Award, FileText, Sparkles,
  Upload, Shield, Target, Activity, HelpCircle, Search,
  MessageCircle, Send, Loader2, Bookmark, X, Users, ShoppingBag,
  Trophy, Bot, Building2, Check,
} from 'lucide-react';

type TopAthleteRow = { profile_id: string; sport: string; rank_score: number; profiles: Profile };
type FeedPostRow = Post & { profiles: Profile };
type SavedPostRow = { post_id: string; posts: FeedPostRow };
type ClubInviteRow = ClubInvite & { organisations: Organisation };

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [topAthletes, setTopAthletes] = useState<TopAthleteRow[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [quickPostContent, setQuickPostContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [postError, setPostError] = useState('');
  const [recentPosts, setRecentPosts] = useState<FeedPostRow[]>([]);
  const [savedPosts, setSavedPosts] = useState<SavedPostRow[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);

  // Real stats for the logged-in athlete: rank score, follower/following
  // counts, and achievement count — none of these are columns on
  // `profiles`, they're computed from their own tables.
  const [myScore, setMyScore] = useState<number | null>(null);
  const [scorePoolCount, setScorePoolCount] = useState<number | null>(null);
  const [latestMovement, setLatestMovement] = useState<{
    rank_score: number | null; previous_rank_score: number | null;
    leaderboard_position: number | null; previous_position: number | null;
    sport: string; trigger_reason: string; recorded_at: string;
  } | null | undefined>(undefined); // undefined = loading, null = no history
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [achievementCount, setAchievementCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [liveRefreshTick, setLiveRefreshTick] = useState(0);
  // Current rank_score per sport, straight from `rankings` (source of truth).
  // The "Latest ScoutRank Movement" card below is driven by `rank_history`,
  // which is a log of past events — if a stat gets unverified and then a new
  // one gets verified shortly after, the most recent history row can still
  // read as "became unranked" even though the athlete is ranked again right
  // now. This map lets that card check itself against current reality before
  // showing "Became unranked".
  const [sportRankMap, setSportRankMap] = useState<Record<string, number> | null>(null);

  // ── Club invites — a club invited this account to join, either as a
  // coach/scout (role_context 'coach_scout') or as a player ('athlete').
  // Lives here rather than a dedicated page, same reasoning as the org
  // page's own "Pending Join Requests" card: the review action is small
  // enough not to need its own route. ──
  const [pendingInvites, setPendingInvites] = useState<ClubInviteRow[]>([]);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    if (!profile) return;
    supabase.from('club_invites').select('*, organisations:organisation_id(*)')
      .eq('invited_profile_id', profile.id).eq('status', 'pending')
      .then(({ data, error }) => {
        if (error) { console.error('[dashboard] club invites error:', error.message); return; }
        setPendingInvites((data as unknown as ClubInviteRow[] | null) ?? []);
      });
  }, [profile?.id]);

  const respondToInvite = async (invite: ClubInviteRow, accept: boolean) => {
    if (!profile) return;
    setRespondingInviteId(invite.id);
    setInviteError('');
    const { error } = await supabase.from('club_invites')
      .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
      .eq('id', invite.id);
    if (error) { setRespondingInviteId(null); setInviteError(error.message); return; }

    if (accept && invite.role_context === 'athlete') {
      const { error: linkErr } = await supabase.from('profiles')
        .update({ affiliated_organisation_id: invite.organisation_id }).eq('id', profile.id);
      if (linkErr) console.error('[dashboard] failed to set affiliated_organisation_id after accepting invite:', linkErr.message);
    }

    if (accept && invite.invited_by) {
      await supabase.from('notifications').insert({
        recipient_id: invite.invited_by, actor_id: profile.id, type: 'club_invite_accepted', target_type: 'club_invite', target_id: invite.id,
      });
    }

    setRespondingInviteId(null);
    setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
  };

  useEffect(() => {
    if (!profile) return;
    let active = true;
    setLoadingStats(true);

    Promise.all([
      supabase.from('rankings').select('rank_score, sport')
        .eq('profile_id', profile.id).eq('division', 'Open')
        .order('rank_score', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('rankings').select('sport, rank_score')
        .eq('profile_id', profile.id).eq('division', 'Open'),
      supabase.from('rank_history')
        .select('rank_score,previous_rank_score,leaderboard_position,previous_position,sport,trigger_reason,recorded_at')
        .eq('profile_id', profile.id).eq('division', 'Open')
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
      supabase.from('posts').select('*', { count: 'exact', head: true }).eq('profile_id', profile.id).eq('post_type', 'achievement'),
    ]).then(([rankingRes, sportRankingsRes, movementRes, followersRes, followingRes, achievementsRes]) => {
      if (!active) return;
      const bestRanking = rankingRes.data as { rank_score: number; sport?: string } | null;
      setMyScore(bestRanking?.rank_score ?? null);
      if (bestRanking?.sport) {
        supabase.from('rankings').select('profile_id')
          .eq('sport', bestRanking.sport).eq('division', 'Open')
          .then(({ data }) => {
            const distinct = new Set((data ?? []).map((r: { profile_id: string }) => r.profile_id)).size;
            setScorePoolCount(Math.max(distinct, 1));
          });
      }
      const sportRankRows = (sportRankingsRes.data as { sport: string; rank_score: number }[] | null) ?? [];
      setSportRankMap(Object.fromEntries(sportRankRows.map(r => [r.sport, Number(r.rank_score)])));
      setLatestMovement((movementRes.data as typeof latestMovement) ?? null);
      setFollowerCount(followersRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);
      setAchievementCount(achievementsRes.count ?? 0);
      setLoadingStats(false);
    });

    return () => { active = false; };
  }, [profile?.id, liveRefreshTick]);

  // Live — a punitive score reset or a newly-verified stat updates your
  // own score/rank on the dashboard immediately, no refresh needed. Also
  // listens for this profile's own posts (achievements included — an
  // achievement is stored as a post with post_type='achievement') so the
  // Achievements stat and profile completeness update the moment one is
  // added, not just on next page load.
  // Scoped to just this profile's rows, not the whole table, since this
  // is a personal dashboard, not a shared leaderboard view.
  useEffect(() => {
    if (!profile?.id) return;
    let debounceTimer: number | null = null;
    const bump = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => setLiveRefreshTick(t => t + 1), 500);
    };
    const channel = supabase
      .channel(`rankings-live-dashboard-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rankings', filter: `profile_id=eq.${profile.id}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `profile_id=eq.${profile.id}` }, bump)
      .subscribe();
    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Top athletes leaderboard preview — two separate queries merged client-side.
  // Must filter to division='Open' after SQL #93 so each athlete appears once
  // (rankings now has one row per profile_id+sport+division).
  function loadTopAthletes() {
    supabase
      .from('rankings')
      .select('profile_id, sport, rank_score, division')
      .eq('division', 'Open')
      .order('rank_score', { ascending: false })
      .limit(50)
      .then(async ({ data: rankData, error: rankError }) => {
        if (rankError) { console.error('Failed to load rankings:', rankError.message); setLoadingAthletes(false); return; }
        if (!rankData || rankData.length === 0) { setTopAthletes([]); setLoadingAthletes(false); return; }

        // Deduplicate: one row per profile_id, keeping the highest rank_score.
        // An athlete with AFL and Swimming both ranked in Open produces two rows;
        // we only show their best score in this list.
        const bestByProfile = new Map<string, { profile_id: string; sport: string; rank_score: number }>();
        for (const r of rankData as { profile_id: string; sport: string; rank_score: number }[]) {
          const existing = bestByProfile.get(r.profile_id);
          if (!existing || Number(r.rank_score) > Number(existing.rank_score)) {
            bestByProfile.set(r.profile_id, r);
          }
        }
        const deduped = [...bestByProfile.values()]
          .sort((a, b) => Number(b.rank_score) - Number(a.rank_score));

        const profileIds = deduped.map(r => r.profile_id);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, first_name, last_name, avatar_url, role, scoutrank_score')
          .in('id', profileIds)
          .eq('role', 'athlete')
          .or('account_status.is.null,account_status.eq.active');

        if (profileError) { console.error('Failed to load profiles:', profileError.message); setLoadingAthletes(false); return; }

        const profileMap = Object.fromEntries(
          ((profileData ?? []) as { id: string; username: string; first_name: string; last_name: string; avatar_url: string | null; role: string; scoutrank_score: number | null }[])
            .map(p => [p.id, p])
        );
        const athletes = deduped
          .filter(r => profileMap[r.profile_id])
          .map(r => ({ ...r, profiles: profileMap[r.profile_id] }))
          .slice(0, 5) as TopAthleteRow[];

        setTopAthletes(athletes);
        setLoadingAthletes(false);
      });
  }

  useEffect(() => {
    loadTopAthletes();
  }, []);

  // Live — refresh the Top 5 Leaderboard whenever ANY athlete's ranking
  // changes, not just this profile's. A stat getting verified for someone
  // else can bump them into (or out of) the top 5, and previously this list
  // only ever loaded once on mount. Unfiltered/table-wide, so debounced a
  // bit more generously than the personal channel above to avoid refetching
  // on every single row change when rankings are being recalculated in bulk.
  useEffect(() => {
    let debounceTimer: number | null = null;
    const channel = supabase
      .channel('rankings-live-leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rankings' }, () => {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(loadTopAthletes, 1500);
      })
      .subscribe();
    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Latest community posts (real, from Supabase)
  useEffect(() => {
    loadRecentPosts();
  }, []);

  // Saved posts — private to this user, requires profile to be loaded
  useEffect(() => {
    if (!profile) return;
    setIsLoadingSaved(true);
    supabase
      .from('saved_posts')
      .select('post_id, posts(*, profiles(*))')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Failed to load saved posts:', error.message);
        setSavedPosts((data as unknown as SavedPostRow[] | null) ?? []);
        setIsLoadingSaved(false);
      });
  }, [profile?.id]);

  const handleUnsave = async (postId: string) => {
    if (!profile) return;
    const { error } = await supabase
      .from('saved_posts')
      .delete()
      .eq('post_id', postId)
      .eq('profile_id', profile.id);
    if (error) {
      console.error('Failed to unsave post:', error.message);
      return;
    }
    setSavedPosts(prev => prev.filter(s => s.post_id !== postId));
  };

  if (!profile) return null;

  // Club-owning accounts don't have a personal athlete dashboard — their
  // club page IS their dashboard. Send them straight there instead of ever
  // rendering the athlete-oriented stats/score/completeness UI below.
  // Mirrors the same redirect already used on AthleteProfilePage.
  if (profile.owned_organisation_id) {
    return <Navigate to={`/organisation/${profile.owned_organisation_id}`} replace />;
  }

  // Calculate profile completeness based on actual data
  let completeness = 10;
  if (profile.bio) completeness += 15;
  if (profile.city) completeness += 10;
  if (profile.age) completeness += 10;
  if (achievementCount > 0) completeness += 20;
  if (followerCount > 0) completeness += 10;
  if (followingCount > 0) completeness += 10;
  completeness = Math.min(completeness, 100);

  const isParent = profile.role === 'parent';
  const isAthlete = profile.role === 'athlete';
  // ScoutRank score is a personal, verified-stat-based ranking — it doesn't
  // apply to admins, coaches, scouts, or club-owner logins (clubs are
  // 'coach'-role accounts under the hood), so the score ring is hidden for
  // those roles.
  const showScoreRing = !isAdmin && profile.role !== 'coach' && profile.role !== 'scout';

  const suggestedActions = [
    { icon: Upload, label: 'Upload a Highlight', desc: 'Add game footage or clips', to: `/profile/${profile.username}?tab=highlights`, show: isAthlete, comingSoon: false },
    { icon: Award, label: 'Add Achievement', desc: 'Submit your first achievement', to: `/profile/${profile.username}?tab=achievements`, show: isAthlete, comingSoon: false },
    { icon: FileText, label: 'Complete Bio', desc: 'Tell your sporting story', to: '/settings', show: !isParent, comingSoon: false },
    { icon: Search, label: 'Browse Athletes', desc: 'Discover other athletes', to: '/discover', show: true, comingSoon: false },
    // No "resume" tab exists on the profile page yet — this used to link
    // there anyway and land on a blank tab panel. Marked Coming Soon instead
    // of hiding it outright, since the feature is still on the roadmap.
    { icon: Sparkles, label: 'Generate AI Resume', desc: 'Create your athlete CV', to: `/profile/${profile.username}?tab=resume`, show: isAthlete, comingSoon: true },
    { icon: Shield, label: 'Verification Centre', desc: 'Get verified as a coach or scout', to: '/verification-status', show: profile.role === 'coach' || profile.role === 'scout', comingSoon: false },
    { icon: Users, label: 'My Athletes', desc: 'View your linked athletes', to: '/parent', show: isParent, comingSoon: false },
  ].filter(a => a.show);

  const handleQuickPost = async () => {
    if (posting || !quickPostContent.trim() || !profile) return;
    if (isParent) return; // parents cannot post
    setPosting(true);
    setPostError('');
    const { data: insertedPost, error } = await supabase.from('posts').insert({
      profile_id: profile.id,
      caption: quickPostContent,
      media_url: null,
      sport_tag: null,
    }).select('id').single();
    setPosting(false);
    if (error) {
      setPostError(error.message.includes('Rate limit') ? error.message.replace(/^.*Rate limit exceeded: /, '') : 'Something went wrong posting this. Please try again.');
      return;
    }
    if (insertedPost) triggerPostModeration((insertedPost as { id: string }).id, null, null);
    setQuickPostContent('');
    setPostSuccess(true);
    setTimeout(() => setPostSuccess(false), 2500);
    loadRecentPosts();
  };

  function loadRecentPosts() {
    supabase
      .from('posts')
      .select('*, profiles(*)')
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        if (error) console.error('Failed to load recent posts:', error.message);
        setRecentPosts((data as unknown as FeedPostRow[] | null) ?? []);
      });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Welcome Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full overflow-hidden avatar-ring">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xl font-bold rounded-full">
                {profile.first_name?.[0]}{profile.last_name?.[0]}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Welcome, <span className="gradient-text-brand">{profile.first_name}</span>
            </h1>
            <p className="text-sr-text-muted mt-1 font-mono text-sm tracking-wide">{displayRole(profile).toUpperCase()}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {showScoreRing && (
            <>
              <div className="flex-col items-end gap-1 hidden sm:flex">
                <div className="text-xs text-sr-purple-light uppercase tracking-widest font-semibold">ScoutRank</div>
                <ScoreRing score={myScore} size={88} />
              </div>
              {/* Was completely absent below the sm breakpoint — a phone visitor
                  had no way to see their own score ring on the dashboard at all.
                  Smaller size to fit next to the avatar/name row on narrow screens. */}
              <div className="sm:hidden">
                <ScoreRing score={myScore} size={52} />
              </div>
            </>
          )}
          {isAdmin && (
            <Button variant="brand" size="sm" icon={<Shield className="h-4 w-4" />} onClick={() => navigate('/admin')}>
              Admin
            </Button>
          )}
        </div>
      </div>

      {pendingInvites.length > 0 && (
        <div className="card-premium p-4 mb-6 border-sr-purple/25">
          <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sr-purple-light" /> Club Invites
          </p>
          {inviteError && <p className="text-xs text-red-400 mb-2">{inviteError}</p>}
          <div className="space-y-2">
            {pendingInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-sr-surface border border-sr-border">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center">
                    {invite.organisations?.logo_url ? (
                      <img src={invite.organisations.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-5 w-5 text-white" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{invite.organisations?.name ?? 'A club'}</p>
                    <p className="text-xs text-sr-text-muted">
                      Invited you to join as {invite.role_context === 'coach_scout' ? 'a coach/scout' : 'a player'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => respondToInvite(invite, true)} disabled={respondingInviteId === invite.id}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50">
                    {respondingInviteId === invite.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Accept
                  </button>
                  <button onClick={() => respondToInvite(invite, false)} disabled={respondingInviteId === invite.id}
                    className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-red-500/30 hover:text-red-400 disabled:opacity-50">
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: TrendingUp, label: 'Followers', value: loadingStats ? '—' : followerCount.toString(), color: 'from-green-400 to-emerald-500' },
              { icon: Activity, label: 'Following', value: loadingStats ? '—' : followingCount.toString(), color: 'from-sr-blue to-cyan-400' },
              { icon: Award, label: 'Achievements', value: loadingStats ? '—' : achievementCount.toString(), color: 'from-sr-violet to-sr-purple' },
            ].map(stat => (
              <div key={stat.label} className="card-glass p-4 border-sr-border/50 bg-sr-surface/30">
                <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2`}>
                  <stat.icon className="h-4 w-4 text-white" />
                </div>
                <div className="text-xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-sr-text-muted">{stat.label}</div>
                {(stat as { poolCount?: number | null }).poolCount !== undefined && (() => {
                  const trust = getTrustMeta((stat as { poolCount?: number | null }).poolCount ?? 1);
                  return trust ? (
                    <span title={trust.tooltip}
                      className={`mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-sr-surface cursor-help ${trust.cls}`}>
                      {trust.label}
                    </span>
                  ) : null;
                })()}
              </div>
            ))}
          </div>

          {/* Marketplace quick link */}
          <Link to="/combine" className="card-premium p-4 mt-6 flex items-center gap-3 hover:border-sr-purple/30 transition-colors">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="h-5 w-5 text-sr-purple-light" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Combine</p>
              <p className="text-xs text-sr-text-muted">Training programs, coaching & more</p>
            </div>
          </Link>

          {/* Quick Post — hidden for parents */}
          {!isParent && (
          <div className="card-premium p-4 bg-sr-surface flex gap-3 items-start mt-6">
            <div className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-sr-purple/20 flex items-center justify-center text-sr-purple-light text-sm font-bold">
                  {profile.first_name?.[0]}{profile.last_name?.[0]}
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col items-end">
              <textarea
                className="w-full bg-transparent border-none outline-none resize-none text-sm text-white placeholder:text-sr-text-muted min-h-[40px] pt-2"
                placeholder="Share an update, clip, or result..."
                value={quickPostContent}
                onChange={e => setQuickPostContent(e.target.value)}
              />
              <div className="flex justify-between items-center w-full mt-2 border-t border-sr-border/50 pt-2">
                <div className="flex gap-2">
                  {/* Quick Post here is text-only (no media_url support), so this
                      icon used to do nothing when tapped. It now sends you to the
                      Feed's full composer, which actually supports attachments. */}
                  <button type="button" title="Attach a photo or video"
                    onClick={() => navigate('/feed?compose=1')}
                    className="p-2 text-sr-text-muted hover:text-sr-purple-light transition-colors rounded-full hover:bg-sr-purple/10">
                    <Upload className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {postError && (
                    <span className="text-red-400 text-xs">{postError}</span>
                  )}
                  {postSuccess && (
                    <span className="text-green-400 text-xs">Shared!</span>
                  )}
                  <Button variant="brand" size="sm"
                    className="rounded-full px-4"
                    icon={posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3 w-3" />}
                    disabled={!quickPostContent.trim() || posting}
                    onClick={handleQuickPost}>
                    {posting ? 'Posting...' : 'Post'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Latest movement card */}
          {latestMovement !== undefined && (
            <div className="card-premium p-4">
              <p className="text-xs font-semibold text-sr-text-muted uppercase tracking-wide mb-3">Latest ScoutRank Movement</p>
              {latestMovement === null ? (
                <div>
                  <p className="text-sm text-sr-silver">No ScoutRank movement yet</p>
                  <p className="text-xs text-sr-text-muted mt-0.5">Get a stat verified to enter the rankings.</p>
                </div>
              ) : (() => {
                const h = latestMovement;
                // `h` is a snapshot of the most recent rank_history event, which can
                // lag behind reality — e.g. a stat gets unverified (recording an
                // "unranked" event) and then a new stat gets verified shortly after,
                // putting the athlete back in the rankings. If `rankings` currently
                // shows an active score for this sport, trust that over the stale
                // history row rather than telling the athlete they're unranked.
                const liveScoreForSport = sportRankMap?.[h.sport] ?? null;
                const effectiveRankScore = h.rank_score ?? liveScoreForSport;
                const newlyRanked    = h.previous_rank_score == null && effectiveRankScore != null;
                const becameUnranked = h.previous_rank_score != null && effectiveRankScore == null;
                const scoreDelta = effectiveRankScore != null && h.previous_rank_score != null
                  ? Math.round((Number(effectiveRankScore) - Number(h.previous_rank_score)) * 100) / 100
                  : null;

                const posDelta = h.leaderboard_position != null && h.previous_position != null
                  ? h.previous_position - h.leaderboard_position : null;
                const isUp   = newlyRanked || (posDelta != null && posDelta > 0) || (scoreDelta != null && scoreDelta > 0);
                const isDown = becameUnranked || (posDelta != null && posDelta < 0) || (scoreDelta != null && scoreDelta < 0);
                const sportLabel = h.sport.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const reasonLabel = ({
                  stat_verified: 'Stat verified',
                  stat_unverified: 'Stat unverified',
                  stat_deleted: 'Stat deleted',
                  full_recalculation: 'Recalculation',
                } as Record<string,string>)[h.trigger_reason] ?? h.trigger_reason.replace(/_/g, ' ');

                return (
                  <div className="flex items-center justify-between">
                    <div>
                      {newlyRanked ? (
                        <p className="text-sm font-semibold text-green-400">Earned first ScoutRank</p>
                      ) : becameUnranked ? (
                        <p className="text-sm font-semibold text-red-400">Became unranked</p>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {isUp && <TrendUpIcon size={14} className="text-green-400" />}
                          {isDown && <TrendDownIcon size={14} className="text-red-400" />}
                          <p className={`text-sm font-bold font-mono ${isUp ? 'text-green-400' : isDown ? 'text-red-400' : 'text-sr-silver'}`}>
                            {scoreDelta != null ? `${scoreDelta > 0 ? '+' : ''}${scoreDelta.toFixed(2)}` : '—'}
                          </p>
                        </div>
                      )}
                      <p className="text-xs text-sr-text-muted mt-0.5">
                        {sportLabel} · {reasonLabel}
                        {h.previous_position != null && h.leaderboard_position != null && (
                          <span> · #{h.previous_position} → #{h.leaderboard_position}</span>
                        )}
                        {newlyRanked && h.leaderboard_position != null && (
                          <span> · Entered at #{h.leaderboard_position}</span>
                        )}
                      </p>
                    </div>
                    {!newlyRanked && !becameUnranked && effectiveRankScore != null && (
                      <div className="text-right">
                        <p className="text-xs text-sr-text-muted">Score</p>
                        <p className="text-sm font-bold text-white">{displayScoutRank(effectiveRankScore)}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Profile Completeness */}
          <div className="card-premium p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Profile Completeness</h3>
              <span className="text-sm font-bold gradient-text-brand">{completeness}%</span>
            </div>
            <div className="h-2 bg-sr-surface rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-sr-purple to-sr-blue rounded-full transition-all duration-500"
                style={{ width: `${completeness}%` }} />
            </div>
            <p className="text-xs text-sr-text-muted mt-3">
              Complete your profile to unlock your ScoutRank score and start climbing the rankings. Add a bio, stats and highlights — get your stats verified to earn a score.
            </p>
          </div>

          {/* Scoring Info Card */}
          <div className="card-premium p-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-sr-purple" />
              How ScoutRank Scoring Works
            </h3>
            <div className="space-y-3">
              <div className="rounded-lg bg-sr-surface border border-sr-border p-3">
                <p className="text-xs font-medium text-sr-silver mb-1">ScoutRank Score (0.00 – 100.00)</p>
                <p className="text-xs text-sr-text-muted leading-relaxed">Your percentile rank among all athletes with verified stats in the same event. At the 85th percentile you score 85.00.</p>
              </div>
              <div className="rounded-lg bg-sr-surface border border-sr-border p-3">
                <p className="text-xs font-medium text-sr-silver mb-1">Open division — your displayed score</p>
                <p className="text-xs text-sr-text-muted leading-relaxed">
                  Your displayed score is your best result in the <span className="text-sr-silver">Open</span> division — compared across all ages. Youth athletes automatically appear in older divisions too (U17 athletes appear in U17, U18 and Open) without any extra submissions.
                </p>
              </div>
              <div className="rounded-lg bg-sr-surface border border-sr-border p-3">
                <p className="text-xs font-medium text-sr-silver mb-1">How to improve</p>
                <p className="text-xs text-sr-text-muted leading-relaxed">Submit stats with photo/video evidence. An admin reviews and verifies each result. Your score updates automatically.</p>
              </div>
              <div className="rounded-lg bg-sr-purple/10 border border-sr-purple/20 p-3">
                <p className="text-xs text-sr-silver">Achievements, posts and follows do not affect your ScoutRank score. Only verified stats count.</p>
              </div>
            </div>
          </div>

          {/* Suggested Actions */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-sr-purple" />
              Get Started
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {suggestedActions.map(action => (
                <button key={action.label}
                  disabled={action.comingSoon}
                  onClick={() => { if (!action.comingSoon) navigate(action.to); }}
                  className={`card-premium p-4 text-left transition-all group relative ${
                    action.comingSoon ? 'opacity-60 cursor-not-allowed' : 'hover:border-sr-purple/30'
                  }`}>
                  {action.comingSoon && (
                    <span className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-sr-surface border border-sr-border text-sr-text-muted">
                      Coming Soon
                    </span>
                  )}
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <action.icon className="h-5 w-5 text-sr-purple-light" />
                  </div>
                  <p className="text-sm font-semibold text-white">{action.label}</p>
                  <p className="text-xs text-sr-text-muted mt-1">{action.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Scout Bot Banner */}
          {/* Was a plain <a href>, which forces a full page reload instead of
              a client-side route change — every other nav link on this page
              uses <Link>/navigate(), so this one was silently slower than
              the rest of the app. */}
          <Link to="/scout-bot"
            className="block card-premium p-5 border-sr-purple/25 hover:border-sr-purple/50 transition-all group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-sr-purple/8 to-sr-blue/8 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center flex-shrink-0 shadow-lg shadow-sr-purple/20 group-hover:scale-110 transition-transform">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-white">Scout Bot</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-400/15 text-green-400 border border-green-400/20 font-medium">AI · Free</span>
                </div>
                <p className="text-xs text-sr-text-muted">Your personal AI sports coach — training plans, performance tips, scout advice.</p>
              </div>
              <span className="text-sr-purple-light text-sm font-semibold group-hover:translate-x-1 transition-transform flex-shrink-0">Chat →</span>
            </div>
          </Link>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Top Athletes Leaderboard */}
          <div className="card-glass p-1 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-sr-purple/20 blur-[50px] pointer-events-none" />
            <div className="p-5 relative z-10">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 tracking-wide uppercase">
                <Trophy className="h-4 w-4 text-sr-purple" />
                Top 5 Leaderboard
              </h3>
            {loadingAthletes ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 text-sr-text-muted animate-spin" />
              </div>
            ) : topAthletes.length === 0 ? (
              <p className="text-xs text-sr-text-muted text-center py-4">
                No athletes yet. Be the first to join the rankings!
              </p>
            ) : (
              <div className="space-y-2">
                {topAthletes.map((row, i) => (
                  <Link
                    key={row.profile_id}
                    to={`/profile/${row.profiles.username}`}
                    className={`flex items-center gap-3 p-2 rounded-xl transition-all ${
                      i < 3 ? 'bg-gradient-to-r from-sr-surface to-sr-bg border border-sr-border/50 hover:border-sr-purple/30' : 'hover:bg-sr-surface-light/50'
                    }`}>
                    <span className={`w-5 text-center text-sm font-display font-bold ${i === 0 ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-sr-text-muted'}`}>{i + 1}</span>
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-sr-purple/40 to-sr-blue/40 flex items-center justify-center text-[10px] font-bold text-white">
                      {row.profiles.first_name?.[0]}{row.profiles.last_name?.[0]}
                    </div>
                    <span className={`text-sm flex-1 truncate ${i < 3 ? 'text-white font-medium' : 'text-sr-silver'}`}>{fullName(row.profiles)}</span>
                    <ScoreRing score={row.rank_score} size={48} />
                  </Link>
                ))}
              </div>
            )}
              <Link to="/rankings" className="text-xs text-sr-purple-light hover:text-sr-purple transition-colors mt-4 block text-center font-medium">View full rankings</Link>
            </div>
          </div>

          {/* Recent Community Posts */}
          <div className="card-premium p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Latest on ScoutRank</h3>
            {recentPosts.length === 0 ? (
              <p className="text-xs text-sr-text-muted text-center py-4">
                No community posts yet. Share something on the Feed!
              </p>
            ) : (
              <div className="space-y-3">
                {recentPosts.map(post => (
                  <div key={post.id} className="p-3 rounded-lg bg-sr-surface/50 border border-sr-border/50">
                    <div className="flex items-center gap-2 mb-1">
                      {post.sport_tag && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sr-purple/10 text-sr-purple-light">
                          {post.sport_tag}
                        </span>
                      )}
                      <span className="text-[10px] text-sr-text-muted">@{post.profiles?.username || 'athlete'}</span>
                    </div>
                    <p className="text-xs text-sr-silver line-clamp-2">{post.caption}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/feed" className="text-xs text-sr-purple-light hover:underline mt-3 inline-block">
              <MessageCircle className="inline h-3 w-3 mr-1" />Go to Feed →
            </Link>
          </div>

          {/* Saved Posts — private to this user */}
          <div className="card-premium p-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-sr-purple" />Saved Posts
            </h3>
            {isLoadingSaved ? (
              <p className="text-xs text-sr-text-muted text-center py-4">Loading...</p>
            ) : savedPosts.length === 0 ? (
              <p className="text-xs text-sr-text-muted text-center py-4">
                Nothing saved yet. Tap the bookmark icon on a post in the Feed to save it here.
              </p>
            ) : (
              <div className="space-y-3">
                {savedPosts.map(saved => (
                  <div key={saved.post_id} className="p-3 rounded-lg bg-sr-surface/50 border border-sr-border/50 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-sr-text-muted">@{saved.posts?.profiles?.username || 'athlete'}</span>
                      <p className="text-xs text-sr-silver line-clamp-2">{saved.posts?.caption}</p>
                    </div>
                    <button onClick={() => handleUnsave(saved.post_id)}
                      className="text-sr-text-muted hover:text-white flex-shrink-0" title="Remove from saved">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
