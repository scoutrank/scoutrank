import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName, displayScoutRank, displayRole } from '@/lib/supabase';
import { BookmarkIcon, CheckmarkIcon, TrendUpIcon, TrendDownIcon } from '@/components/icons';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { uploadMediaBlob, uploadResumable, publicUrlFor, MAX_UPLOAD_BYTES } from '@/lib/mediaStorage';
import { processNewStatSubmission } from '@/lib/aiEvidenceReview';
import { triggerPostModeration } from '@/lib/postModeration';
import { Button } from '@/components/ui/BrandButton';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { formatSportName, formatRelativeDate, shortDate } from '@/utils/format';
import { calculateAgeFromDob } from '@/utils/time';
import { compressImage } from '@/lib/imageCompress';
import { SPORT_OPTIONS, getSportIcon } from '@/lib/sports';
import { SportComingSoon } from '@/components/ui/SportComingSoon';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import type { Profile, Post, StatEventType, AthleteStat, Achievement, MarketplaceListing } from '@/lib/supabase';
import {
  MapPin, Calendar, Shield, TrendingUp, Trophy, Award,
  BarChart3, Video, FileText, Sparkles, Activity, Settings,
  Share2, UserPlus, MessageCircle, Flag,
  ArrowUp, ArrowDown, Target, HelpCircle, Upload, X,
  Send, Play, Camera, Check, AlertCircle, Loader2, Plus, Bookmark, Trash2, ShieldOff, Clock, ShoppingBag,
} from 'lucide-react';

type Tab = 'overview' | 'stats' | 'highlights' | 'achievements' | 'rankings' | 'scoring' | 'posts' | 'saved' | 'listings';

const baseTabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'overview',      label: 'Overview',      icon: Activity },
  { id: 'stats',         label: 'Stats',         icon: BarChart3 },
  { id: 'highlights',    label: 'Highlights',    icon: Video },
  { id: 'achievements',  label: 'Achievements',  icon: Trophy },
  { id: 'rankings',      label: 'Rankings',      icon: TrendingUp },
  { id: 'scoring',       label: 'Scoring',       icon: HelpCircle },
  { id: 'listings',      label: 'Listings',      icon: ShoppingBag },
];

// Coaches, scouts, and admins don't get ranked and don't submit stats or
// achievements — those tabs (and the ranking/scoring system behind them)
// only make sense for athlete accounts. Non-athlete roles get a much
// simpler profile: just an overview, their posts, and (for the owner) saved.
const nonAthleteTabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'posts',    label: 'Posts',    icon: Video },
  { id: 'listings', label: 'Listings', icon: ShoppingBag },
];

// "Saved" is appended only for the profile owner — visitors should
// never even see the tab exists, let alone be able to click into it.
const ownerOnlyTabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'saved', label: 'Saved', icon: Bookmark },
];

// ── Trust label helper (shared logic with RankingsPage) ───────────────────────
export default function AthleteProfilePage() {
  const { username } = useParams();
  const [topSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: currentUser, profile: currentProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>((topSearchParams.get('tab') as Tab) || 'overview');
  const [viewingProfile, setViewingProfile] = useState<Profile | null>(null);
  const [affiliatedClub, setAffiliatedClub] = useState<{ id: string; name: string } | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [followingState, setFollowingState] = useState(false);
  const [followActionPending, setFollowActionPending] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isLoadingFollowData, setIsLoadingFollowData] = useState(true);
  const [rankScore, setRankScore] = useState<number | null>(null);
  const [rankSport, setRankSport] = useState<string | null>(null);
  const [rankPoolCount, setRankPoolCount] = useState<number | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [alsoBlockOnReport, setAlsoBlockOnReport] = useState(true);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportError, setReportError] = useState('');
  const [hasOutgoingBlock, setHasOutgoingBlock] = useState(false); // current user blocked this profile → shows Unblock
  const [interactionBlocked, setInteractionBlocked] = useState(false); // either direction → disables messaging
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockPending, setBlockPending] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [hasListings, setHasListings] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoadingProfile(true);
    supabase
      .from('profiles')
      .select('*')
      .ilike('username', username || '')
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error('Failed to load athlete profile:', error.message);
        setViewingProfile((data as Profile | null) ?? null);
        setIsLoadingProfile(false);
        // Only actually shows the Listings tab to visitors if there's
        // something to see — the owner can also see it while managing
        // an approved-but-currently-empty seller setup (handled below).
        const p = data as Profile | null;
        if (p) {
          supabase.from('marketplace_listings').select('id', { count: 'exact', head: true })
            .eq('seller_id', p.id).eq('status', 'active')
            .then(({ count }) => { if (active) setHasListings((count ?? 0) > 0); });
        }
      });
    return () => { active = false; };
  }, [username]);

  // Live — score resets, account status changes (a moderation action
  // taken against this account), and anything else on the profile row
  // updates immediately for anyone currently looking at it, without
  // needing a manual refresh. Subscribed by username since that's what
  // this page keys off; re-subscribes if a different profile loads.
  useEffect(() => {
    if (!viewingProfile?.id) return;
    const channel = supabase
      .channel(`profile-live-${viewingProfile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${viewingProfile.id}` }, payload => {
        setViewingProfile(prev => prev ? { ...prev, ...(payload.new as Partial<Profile>) } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [viewingProfile?.id]);

  useEffect(() => {
    if (!viewingProfile?.affiliated_organisation_id) { setAffiliatedClub(null); return; }
    supabase.from('organisations').select('id, name').eq('id', viewingProfile.affiliated_organisation_id).maybeSingle()
      .then(({ data }) => setAffiliatedClub(data as { id: string; name: string } | null));
  }, [viewingProfile?.affiliated_organisation_id]);

  // Real follower/following counts + "am I following them?" + rank score —
  // all computed from the real `follows` and `rankings` tables, not from
  // any column on `profiles` (no such columns exist there) and not from
  // the old in-memory store.
  // Counts + rank — only needs viewingProfile
  useEffect(() => {
    if (!viewingProfile) return;
    let active = true;
    setIsLoadingFollowData(true);

    Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', viewingProfile.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', viewingProfile.id),
      supabase.from('rankings').select('rank_score, sport')
        .eq('profile_id', viewingProfile.id).eq('division', 'Open')
        .order('rank_score', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([followersRes, followingRes, rankRes]) => {
      if (!active) return;
      setFollowerCount(followersRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);
      const best = rankRes.data as { rank_score: number; sport: string } | null;
      setRankScore(best?.rank_score ?? null);
      setRankSport(best?.sport ?? null);
      if (best?.sport) {
        supabase.from('rankings').select('profile_id')
          .eq('sport', best.sport).eq('division', 'Open')
          .then(({ data }) => {
            const distinct = new Set((data ?? []).map((r: { profile_id: string }) => r.profile_id)).size;
            setRankPoolCount(Math.max(distinct, 1));
          });
      } else {
        setRankPoolCount(null);
      }
      setIsLoadingFollowData(false);
    });

    return () => { active = false; };
  }, [viewingProfile?.id]);

  // Live — the displayed score/rank comes from the rankings table, not
  // directly from the profile, so it needs its own subscription. Covers
  // both a punitive reset (rows deleted) and normal score changes as new
  // stats get verified — refetches the same "best current ranking" query
  // whenever anything changes for this specific profile.
  useEffect(() => {
    if (!viewingProfile?.id) return;
    const refetchRank = () => {
      supabase.from('rankings').select('rank_score, sport')
        .eq('profile_id', viewingProfile.id).eq('division', 'Open')
        .order('rank_score', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          const best = data as { rank_score: number; sport: string } | null;
          setRankScore(best?.rank_score ?? null);
          setRankSport(best?.sport ?? null);
        });
    };
    const channel = supabase
      .channel(`rankings-live-${viewingProfile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rankings', filter: `profile_id=eq.${viewingProfile.id}` }, refetchRank)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [viewingProfile?.id]);

  // Follow state — only runs when BOTH profiles are known, preventing a false
  // negative from a race where viewingProfile resolves before currentProfile.
  useEffect(() => {
    if (!viewingProfile || !currentProfile || currentProfile.id === viewingProfile.id) return;
    let active = true;

    supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', currentProfile.id)
      .eq('following_id', viewingProfile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { console.error('Failed to load follow state:', error.message); return; }
        setFollowingState(Boolean(data));
      });

    return () => { active = false; };
  }, [viewingProfile?.id, currentProfile?.id]);


  // Two separate block states:
  // hasOutgoingBlock — current user blocked this profile (drives Block/Unblock button)
  // interactionBlocked — either direction (drives messaging availability)
  useEffect(() => {
    if (!currentProfile || !viewingProfile || currentProfile.id === viewingProfile.id) return;
    // Outgoing: direct query — only rows the current user created.
    // Silently skips if blocked_users table doesn't exist yet (SQL #90 not yet run).
    supabase.from('blocked_users')
      .select('blocker_id')
      .eq('blocker_id', currentProfile.id)
      .eq('blocked_id', viewingProfile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error) setHasOutgoingBlock(Boolean(data));
      });
    // Bidirectional: RPC — both directions, no direction metadata exposed.
    // Silently skips if SQL #90 not yet run.
    supabase.rpc('get_blocked_counterpart_ids')
      .then(({ data, error }) => {
        if (!error) {
          const ids = new Set<string>((data ?? []).map((r: { profile_id: string }) => r.profile_id));
          setInteractionBlocked(ids.has(viewingProfile.id));
        }
      });
  }, [currentProfile?.id, viewingProfile?.id]);

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue animate-pulse-glow" />
      </div>
    );
  }

  if (!viewingProfile) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-display font-bold gradient-text mb-4">404</h1>
          <p className="text-sr-text-muted mb-4">Athlete not found</p>
          <Button variant="outline" onClick={() => navigate('/discover')}>Browse Athletes</Button>
        </div>
      </div>
    );
  }

  const profile = viewingProfile;

  // Club-owning accounts don't have a separate personal profile page
  // anymore — their club page IS their profile. Send everyone (the owner
  // included) straight there instead of ever rendering this page for them.
  if (profile.owned_organisation_id) {
    return <Navigate to={`/organisation/${profile.owned_organisation_id}`} replace />;
  }

  // Determine ownership: compare by user id (profile.id IS the auth user id per schema).
  // Parents are read-only accounts and are NEVER treated as owners, even when
  // viewing their own profile, so they never see add/edit controls.
  const isOwner = !!currentUser && currentUser.id === profile.id && currentProfile?.role !== 'parent';

  // ── Minor Safety Gate ──────────────────────────────────────────
  // Rule: if the viewer is (or may be) under 18, they cannot view
  // coach/scout profiles that are not yet verified by ScoutRank.
  // Fails closed: unknown or missing age is treated as a minor.
  // Owners always see their own profile regardless.
  const targetIsUnverifiedCoachOrScout =
    (profile.role === 'coach' || profile.role === 'scout') &&
    profile.coach_scout_verification_status !== 'verified';

  // Compute from DOB — never rely on the stored age integer.
  const viewerAge = calculateAgeFromDob(currentProfile?.date_of_birth);
  const viewerIsMinor = viewerAge === null || viewerAge < 18;

  if (!isOwner && targetIsUnverifiedCoachOrScout && viewerIsMinor) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="card-premium p-10">
            <div className="h-16 w-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 border border-sr-purple/30 flex items-center justify-center">
              <Shield className="h-8 w-8 text-sr-purple-light" />
            </div>
            <h1 className="text-xl font-bold text-white mb-3">This account is unavailable</h1>
            <p className="text-sm text-sr-text-muted leading-relaxed mb-6">
              This coach or scout has not yet been verified by ScoutRank and cannot be viewed by users under 18.
              Once their verification is approved, their profile will become accessible.
            </p>
            <Button variant="brand" onClick={() => navigate('/discover')}>
              Back to Discover
            </Button>
          </div>
        </div>
      </div>
    );
  }
  // ── End Minor Safety Gate ──────────────────────────────────────

  const handleFollow = async () => {
    if (!currentProfile || !profile || followActionPending) return;
    if (currentProfile.role === 'parent') return;
    setFollowActionPending(true);

    if (followingState) {
      // Unfollow: delete the exact pair, then re-query to confirm
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentProfile.id)
        .eq('following_id', profile.id);
    } else {
      // Follow: idempotent upsert — never 409s on a duplicate row
      await supabase
        .from('follows')
        .upsert(
          { follower_id: currentProfile.id, following_id: profile.id },
          { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
        );
    }

    // Re-query the exact relationship for ground truth (no optimistic assumptions)
    const [relRes, countRes] = await Promise.all([
      supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', currentProfile.id)
        .eq('following_id', profile.id)
        .maybeSingle(),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profile.id),
    ]);

    const followRow = relRes.data;
    const followerCount = countRes.count ?? 0;

    setFollowingState(Boolean(followRow));
    setFollowerCount(followerCount);
    setFollowActionPending(false);
  };

  const handleMessage = () => {
    if (!profile) return;
    interactionBlocked ? undefined : navigate(`/feed?dm=${profile.id}`);
  };

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `${fullName(profile)} on ScoutRank`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2500);
      });
    }
  };

  const handleEditProfile = () => navigate('/settings');

  const handleReport = async () => {
    if (!reportCategory || !currentProfile || !profile) return;
    setReportError('');
    const { error } = await supabase.from('reports').insert({
      reporter_id: currentProfile.id,
      reported_profile_id: profile.id,
      category: reportCategory,
      reason: reportReason.trim() || reportCategory,
    });
    if (error) {
      setReportError(error.message.includes('Rate limit') ? error.message.replace(/^.*Rate limit exceeded: /, '') : 'Could not submit report. Please try again.');
      return;
    }
    if (alsoBlockOnReport && !hasOutgoingBlock) {
      const { error: blockErr } = await supabase.from('blocked_users').insert({ blocker_id: currentProfile.id, blocked_id: profile.id });
      if (!blockErr) {
        setHasOutgoingBlock(true);
        setInteractionBlocked(true);
        setFollowingState(false);
      }
    }
    setReportSubmitted(true);
    setTimeout(() => {
      setShowReportModal(false);
      setReportSubmitted(false);
      setReportCategory('');
      setReportReason('');
      setReportError('');
    }, 2000);
  };


  const handleBlock = async () => {
    if (!currentProfile || !profile || blockPending) return;
    setBlockPending(true);
    if (hasOutgoingBlock) {
      await supabase.from('blocked_users').delete().eq('blocker_id', currentProfile.id).eq('blocked_id', profile.id);
      setHasOutgoingBlock(false);
      setInteractionBlocked(false); // our outgoing block removed; recheck via RPC
      // Re-query bidirectional state in case the other party has also blocked us
      supabase.rpc('get_blocked_counterpart_ids').then(({ data }) => {
        const ids = new Set<string>((data ?? []).map((r: { profile_id: string }) => r.profile_id));
        setInteractionBlocked(ids.has(profile.id));
      });
    } else {
      await supabase.from('blocked_users').insert({ blocker_id: currentProfile.id, blocked_id: profile.id });
      setHasOutgoingBlock(true);
      setInteractionBlocked(true);
      setFollowingState(false); // DB trigger removes follows
    }
    setShowBlockModal(false);
    setBlockPending(false);
  };

  return (
    <div className="min-h-screen bg-sr-bg">
      {/* Share toast */}
      {shareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-sr-surface border border-sr-purple/30 rounded-xl text-sm text-white shadow-lg flex items-center gap-2">
          <Check className="h-4 w-4 text-green-400" /> Link copied to clipboard
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-sr-surface border border-sr-border rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Flag className="h-5 w-5 text-red-400" /> Report Profile
            </h3>
            {reportSubmitted ? (
              <div className="text-center py-6">
                <Check className="h-10 w-10 text-green-400 mx-auto mb-3" />
                <p className="text-sm text-sr-silver">Report submitted. Our team will review it shortly.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-sr-text-muted mb-4">Please select why you're reporting @{profile.username}.</p>
                <div className="space-y-2 mb-4">
                  {[
                    ['fake_profile', 'Fake profile'],
                    ['misleading_information', 'Misleading information'],
                    ['inappropriate_content', 'Inappropriate content'],
                    ['harassment', 'Harassment or bullying'],
                    ['underage_safety', 'Safety concern about a minor'],
                    ['spam', 'Spam'],
                    ['other', 'Other'],
                  ].map(([value, label]) => (
                    <button key={value} onClick={() => setReportCategory(value)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-all ${
                        reportCategory === value ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="block text-xs text-sr-text-muted mb-1">Additional details (optional)</label>
                <textarea value={reportReason} onChange={e => setReportReason(e.target.value)} rows={2}
                  className="input-dark w-full resize-none text-sm mb-3" placeholder="Anything else that would help us review this?" />
                <label className="flex items-center gap-2 mb-4 cursor-pointer">
                  <input type="checkbox" checked={alsoBlockOnReport} onChange={e => setAlsoBlockOnReport(e.target.checked)} />
                  <span className="text-xs text-sr-text-muted">Also block @{profile.username} so you don't see their content</span>
                </label>
                {reportError && <p className="text-xs text-red-400 mb-3">{reportError}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowReportModal(false); setReportError(''); }}>Cancel</Button>
                  <Button variant="danger" size="sm" disabled={!reportCategory} onClick={handleReport}>Submit Report</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Block / Unblock modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-sr-surface border border-sr-border rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-red-400" />
              {hasOutgoingBlock ? `Unblock @${profile.username}?` : `Block @${profile.username}?`}
            </h3>
            <p className="text-sm text-sr-text-muted mb-5">
              {hasOutgoingBlock
                ? 'They will be able to see your profile and posts again.'
                : 'They will not be able to message you or appear in your feed. Any follow relationship between you will be removed.'}
            </p>
            <div className="flex gap-3">
              <Button variant="ghost" size="sm" onClick={() => setShowBlockModal(false)} disabled={blockPending}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleBlock} disabled={blockPending}
                icon={blockPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
                {hasOutgoingBlock ? 'Unblock' : 'Block user'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Banner */}
      <div className="h-48 sm:h-64 relative overflow-hidden">
        {profile.banner_url ? (
          <img src={profile.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-sr-surface to-sr-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-sr-bg via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_50%,rgba(138,63,252,0.3),transparent_50%)]" />
        {isOwner && (
          <button onClick={handleEditProfile}
            className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-black/30 backdrop-blur-sm text-white/80 hover:text-white transition-all" title="Edit Profile">
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Profile Header */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="relative -mt-20 sm:-mt-24 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-2xl border-4 border-sr-bg shadow-xl glow-brand flex-shrink-0 overflow-hidden">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={fullName(profile)} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-4xl sm:text-5xl font-bold text-white">
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
                {(profile.role === 'coach' || profile.role === 'scout') && (
                  <VerificationBadge status={profile.coach_scout_verification_status} role={profile.role} />
                )}
              </div>
              <p className="text-sr-text-muted">@{profile.username}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-sr-text-muted flex-wrap">
                {(profile.city || profile.state) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {[profile.city, profile.state].filter(Boolean).join(', ')}
                  </span>
                )}
                {affiliatedClub && (
                  <Link to={`/organisation/${affiliatedClub.id}`} className="flex items-center gap-1 text-sr-purple-light hover:text-white transition-colors">
                    <Shield className="h-3.5 w-3.5" />
                    {affiliatedClub.name} <span className="text-green-400">✓</span>
                  </Link>
                )}
                {profile.age != null && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {profile.age} yrs
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm">
                <span className="text-white font-semibold">
                  {isLoadingFollowData ? '—' : followerCount} <span className="text-sr-text-muted font-normal">followers</span>
                </span>
                <span className="text-white font-semibold">
                  {isLoadingFollowData ? '—' : followingCount} <span className="text-sr-text-muted font-normal">following</span>
                </span>
              </div>
              {isOwner && (profile.role === 'coach' || profile.role === 'scout') && (
                <div className="mt-2">
                  <Link to="/verification-status" className="text-xs text-sr-purple-light hover:text-sr-purple transition-colors flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {profile.coach_scout_verification_status === 'verified'
                      ? 'View verification'
                      : profile.coach_scout_verification_status === 'pending'
                      ? 'Check verification status'
                      : 'Apply for verification →'}
                  </Link>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:pb-2 flex-wrap">
              {isOwner ? (
                // Owner sees: Edit Profile + Share — NO follow or report
                <>
                  <Button variant="outline" size="sm" icon={<Settings className="h-4 w-4" />} onClick={handleEditProfile}>
                    Edit Profile
                  </Button>
                  <Button variant="brand" size="sm" icon={<Share2 className="h-4 w-4" />} onClick={handleShare}>
                    Share
                  </Button>
                </>
              ) : (
                // Visitor sees: Follow + Message + Report — NO edit
                // Parents see Report only (they can view but not interact)
                <>
                  {currentProfile?.role !== 'parent' && (
                    <Button
                      variant={followingState ? 'outline' : 'brand'}
                      size="sm"
                      onClick={handleFollow}
                      disabled={followActionPending}
                      icon={followingState ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                    >
                      {followingState ? 'Following' : 'Follow'}
                    </Button>
                  )}
                  {currentProfile?.role !== 'parent' && (
                    <Button variant="outline" size="sm" icon={<MessageCircle className="h-4 w-4" />} onClick={interactionBlocked ? undefined : handleMessage} disabled={interactionBlocked}>
                      Message
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" icon={<Flag className="h-4 w-4" />} onClick={() => setShowReportModal(true)}>
                    Report
                  </Button>
                  <Button variant="ghost" size="sm" icon={<ShieldOff className="h-4 w-4" />} onClick={() => setShowBlockModal(true)}>
                    {hasOutgoingBlock ? 'Unblock' : 'Block'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {profile.role === 'athlete' && (
          <div className="mb-4">
            <Link to={`/profile/${profile.username}/passport`}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30 transition-colors">
              📋 View Performance Passport
            </Link>
          </div>
        )}

        {profile.role === 'athlete' && profile.recruitment_open && (
          <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-sr-purple/15 to-sr-blue/15 border border-sr-purple/30 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" /> Open to Recruitment
            </span>
            {(profile.recruitment_seeking ?? []).map(v => (
              <span key={v} className="text-[10px] px-2 py-0.5 rounded-full bg-sr-surface border border-sr-border text-sr-text-muted capitalize">
                {({ scholarships: 'Scholarships', clubs: 'Clubs', academies: 'Academies', recruiters: 'Open to recruiters' } as Record<string, string>)[v] ?? v}
              </span>
            ))}
          </div>
        )}

        {/* ScoutRank Score Banner — athletes only. Coaches/scouts/admins
            don't submit stats and don't get ranked, so this doesn't apply
            to them at all. */}
        {profile.role === 'athlete' && (
        <div className="card-premium p-5 mb-6 flex flex-col sm:flex-row items-center gap-4">
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-display font-bold gradient-text-brand">
              {isLoadingFollowData ? '—' : (rankScore !== null ? displayScoutRank(rankScore) : 'Not Ranked')}
            </div>
            <div className="text-xs text-sr-text-muted mb-1">ScoutRank Score</div>
            {rankScore !== null && rankPoolCount !== null && (
              <TrustBadge poolCount={rankPoolCount} />
            )}
          </div>
          <div className="h-12 w-px bg-sr-border hidden sm:block" />
          <div className="text-sm text-sr-silver leading-relaxed flex-1">
            <p className="text-xs text-sr-text-muted mb-1 uppercase tracking-wide">How Scoring Works</p>
            <p>
              {isOwner ? 'Your ScoutRank' : `${profile.first_name}'s ScoutRank`} score reflects sporting reputation. Your score is based on verified official stats — percentile ranked against other athletes in each event.{' '}
              <button onClick={() => setActiveTab('scoring')} className="text-sr-purple-light hover:underline">Learn more →</button>
            </p>
          </div>
        </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <div className="mb-6">
            <p className="text-sr-silver leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-sr-border mb-6">
          <div className="flex gap-0 overflow-x-auto border-b border-sr-border [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {[...(profile.role === 'athlete' ? baseTabs : nonAthleteTabs), ...(isOwner ? ownerOnlyTabs : [])]
              .filter(tab => {
                // Privacy settings only restrict what OTHER people see —
                // the owner always sees their own full profile regardless.
                if (tab.id === 'listings') {
                  if (isOwner) return profile.seller_status === 'approved' || hasListings;
                  return hasListings;
                }
                if (isOwner) return true;
                if (tab.id === 'stats' && !profile.show_stats) return false;
                if (tab.id === 'rankings' && !profile.show_rankings) return false;
                return true;
              })
              .map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                  activeTab === tab.id ? 'border-sr-purple text-white' : 'border-transparent text-sr-text-muted hover:text-sr-silver'
                }`}>
                <tab.icon className="h-4 w-4" />{tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="pb-16">
          {activeTab === 'overview' && <OverviewTab profile={profile} isOwner={isOwner} />}
          {/* Same privacy guard here as the tab bar above — defense in
              depth in case activeTab ever ends up set to a hidden tab
              by some other path. Also gated to athlete accounts only —
              stats/highlights/achievements/rankings/scoring don't apply
              to coach/scout/admin profiles. */}
          {activeTab === 'stats' && profile.role === 'athlete' && (isOwner || profile.show_stats) && <StatsTab isOwner={isOwner} profileId={profile.id} ownerRole={profile.role} />}
          {activeTab === 'highlights' && profile.role === 'athlete' && <HighlightsTab isOwner={isOwner} profileId={profile.id} profileName={profile.first_name} />}
          {activeTab === 'achievements' && profile.role === 'athlete' && <AchievementsTab isOwner={isOwner} profileId={profile.id} profileName={profile.first_name} />}
          {activeTab === 'rankings' && profile.role === 'athlete' && (isOwner || profile.show_rankings) && (
            <RankingsTab profileId={profile.id} rankScore={rankScore} rankSport={rankSport} rankPoolCount={rankPoolCount} />
          )}
          {activeTab === 'scoring' && profile.role === 'athlete' && <ScoringTab profileId={profile.id} />}
          {activeTab === 'posts' && profile.role !== 'athlete' && <PostsTab profileId={profile.id} />}
          {activeTab === 'listings' && <ListingsTab profileId={profile.id} isOwner={isOwner} />}
          {/* Saved tab: only ever rendered when isOwner is true (gated
              above in the tab bar too) — RLS on saved_posts also
              independently enforces auth.uid() = profile_id, so even a
              manipulated activeTab state couldn't leak another user's
              saved posts; this is defense in depth, not the only guard. */}
          {activeTab === 'saved' && isOwner && <SavedTab profileId={profile.id} />}
        </div>
      </div>
    </div>
  );
}

// ── OVERVIEW ────────────────────────────────────────
function OverviewTab({ profile, isOwner }: { profile: Profile; isOwner: boolean }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);

  // Lets the owner post straight from their own profile, same as the
  // "Quick Post" composer on the Dashboard — posting shouldn't be a
  // Dashboard-only thing when you're already looking at your profile.
  const [postContent, setPostContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [postSuccess, setPostSuccess] = useState(false);

  function loadRecentActivity() {
    setIsLoadingPosts(true);
    supabase
      .from('posts')
      .select('*')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        if (error) console.error('Failed to load recent activity:', error.message);
        setPosts((data as Post[] | null) ?? []);
        setIsLoadingPosts(false);
      });
  }

  useEffect(() => {
    let active = true;
    setIsLoadingPosts(true);
    supabase
      .from('posts')
      .select('*')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error('Failed to load recent activity:', error.message);
        setPosts((data as Post[] | null) ?? []);
        setIsLoadingPosts(false);
      });
    return () => { active = false; };
  }, [profile.id]);

  const handlePost = async () => {
    if (posting || !postContent.trim()) return;
    setPosting(true);
    setPostError('');
    const { data: insertedPost, error } = await supabase.from('posts').insert({
      profile_id: profile.id,
      caption: postContent,
      media_url: null,
      sport_tag: null,
    }).select('id').single();
    setPosting(false);
    if (error) {
      setPostError(error.message.includes('Rate limit') ? error.message.replace(/^.*Rate limit exceeded: /, '') : 'Something went wrong posting this. Please try again.');
      return;
    }
    if (insertedPost) triggerPostModeration((insertedPost as { id: string }).id, null, null);
    setPostContent('');
    setPostSuccess(true);
    setTimeout(() => setPostSuccess(false), 2500);
    loadRecentActivity();
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="card-premium p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-sr-purple" />About
          </h3>
          {profile.bio ? (
            <p className="text-sm text-sr-silver leading-relaxed">{profile.bio}</p>
          ) : (
            <p className="text-sm text-sr-text-muted">
              {isOwner ? 'Add a bio to tell your story. Go to Settings → Profile.' : 'No bio yet.'}
            </p>
          )}
        </div>
        {isOwner && (
          <div className="card-premium p-4 bg-sr-surface flex gap-3 items-start">
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
                value={postContent}
                onChange={e => setPostContent(e.target.value)}
              />
              <div className="flex justify-between items-center w-full mt-2 border-t border-sr-border/50 pt-2">
                <div className="flex gap-2">
                  <button className="p-2 text-sr-text-muted hover:text-sr-purple-light transition-colors rounded-full hover:bg-sr-purple/10"><Upload className="h-4 w-4" /></button>
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
                    disabled={!postContent.trim() || posting}
                    onClick={handlePost}>
                    {posting ? 'Posting...' : 'Post'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="card-premium p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Recent Activity</h3>
          {isLoadingPosts ? (
            <p className="text-sm text-sr-text-muted">Loading...</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-sr-text-muted">
              No posts yet.{isOwner ? ' Share your first update above!' : ''}
            </p>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="p-3 rounded-xl bg-sr-surface border border-sr-border">
                  <p className="text-sm text-sr-silver">{post.caption}</p>
                  <p className="text-xs text-sr-text-muted mt-1">{new Date(post.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-6">
        <div className="card-premium p-6">
          <h3 className="text-sm font-semibold text-white mb-3">Details</h3>
          <div className="space-y-3 text-sm">
            {[
              { icon: MapPin, label: 'Location', value: [profile.city, profile.state, profile.country].filter(Boolean).join(', ') || 'Not set' },
              { icon: Calendar, label: 'Joined', value: new Date(profile.created_at).toLocaleDateString() },
              { icon: Target, label: 'Role', value: displayRole(profile) },
            ].map(d => (
              <div key={d.label} className="flex items-center gap-2">
                <d.icon className="h-4 w-4 text-sr-text-muted flex-shrink-0" />
                <div>
                  <p className="text-xs text-sr-text-muted">{d.label}</p>
                  <p className="text-sr-silver text-sm">{d.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── POSTS (non-athlete roles: coach/scout/admin) ──────────────────────
// A simple grid of everything they've posted — photos/videos of athletes
// they've scouted, updates, etc. No stats/achievements here; those don't
// apply to these account types.

/**
 * Shows what this person has for sale on Combine. Visitors only see
 * active (approved) listings; the owner sees everything — including
 * still-pending or rejected ones — since this doubles as how they keep
 * track of their own listings.
 */
function ListingsTab({ profileId, isOwner }: { profileId: string; isOwner: boolean }) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subTab, setSubTab] = useState<'live' | 'removed'>('live');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    let q = supabase.from('marketplace_listings').select('*').eq('seller_id', profileId).order('created_at', { ascending: false });
    if (!isOwner) q = q.eq('status', 'active');
    q.then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('Failed to load listings:', error.message);
      setListings((data as MarketplaceListing[] | null) ?? []);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [profileId, isOwner]);

  if (isLoading) return <p className="text-sm text-sr-text-muted">Loading...</p>;

  // Visitors only ever see active listings anyway (enforced in the
  // query above), so the Live/Removed split only makes sense — and only
  // renders — for the owner managing their own listings.
  const visible = isOwner
    ? listings.filter(l => subTab === 'removed' ? l.status === 'removed' : l.status !== 'removed')
    : listings;

  if (listings.length === 0) {
    return (
      <div className="text-center py-12">
        <ShoppingBag className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
        <p className="text-sm text-sr-text-muted">{isOwner ? "You haven't listed anything on Combine yet." : "Nothing listed on Combine yet."}</p>
        {isOwner && (
          <Link to="/combine/new" className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
            List Something
          </Link>
        )}
      </div>
    );
  }

  const statusBadge = (status: MarketplaceListing['status']) => {
    if (status === 'active') return null;
    const labels: Record<string, string> = { pending_payment: 'Payment pending', pending_review: 'Under review', rejected: 'Not approved', paused: 'Paused', removed: 'Removed' };
    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sr-surface border border-sr-border text-sr-text-muted">{labels[status] ?? status}</span>;
  };

  return (
    <div>
      {isOwner && (
        <div className="flex gap-2 mb-4">
          {(['live', 'removed'] as const).map(t => (
            <button key={t} onClick={() => setSubTab(t)}
              className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors ${
                subTab === t ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
              }`}>
              {t} ({listings.filter(l => t === 'removed' ? l.status === 'removed' : l.status !== 'removed').length})
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-sr-text-muted text-center py-8">
          {subTab === 'removed' ? 'Nothing removed.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {visible.map(l => (
            <Link key={l.id} to={`/combine/${l.id}`} className="card-premium p-4 hover:border-sr-purple/30 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-sr-text-muted">{l.category.replace(/_/g, ' ')}</span>
                {statusBadge(l.status)}
              </div>
              <p className="text-sm font-semibold text-white">{l.title}</p>
              <p className="text-sm font-bold text-sr-purple-light mt-1">
                {new Intl.NumberFormat(undefined, { style: 'currency', currency: l.currency.toUpperCase() }).format(l.price_cents / 100)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PostsTab({ profileId }: { profileId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subTab, setSubTab] = useState<'media' | 'text'>('media');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    supabase
      .from('posts')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error('Failed to load posts:', error.message);
        setPosts((data as Post[] | null) ?? []);
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [profileId]);

  if (isLoading) return <p className="text-sm text-sr-text-muted">Loading...</p>;

  const mediaPosts = posts.filter(p => !!p.media_url);
  const textPosts = posts.filter(p => !p.media_url);
  const activePosts = subTab === 'media' ? mediaPosts : textPosts;

  return (
    <div>
      {/* Sub-tabs: photos/videos vs text-only posts */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl bg-sr-surface border border-sr-border w-fit">
        <button
          onClick={() => setSubTab('media')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            subTab === 'media' ? 'bg-sr-purple text-white' : 'text-sr-text-muted hover:text-white'
          }`}
        >
          <Video className="h-3.5 w-3.5" />Photos &amp; Videos
        </button>
        <button
          onClick={() => setSubTab('text')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            subTab === 'text' ? 'bg-sr-purple text-white' : 'text-sr-text-muted hover:text-white'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />Text Only
        </button>
      </div>

      {activePosts.length === 0 ? (
        <div className="card-premium p-12 text-center">
          {subTab === 'media' ? (
            <Video className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
          ) : (
            <FileText className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
          )}
          <h3 className="text-sm font-semibold text-white mb-1">
            {subTab === 'media' ? 'No photos or videos yet' : 'No text posts yet'}
          </h3>
          <p className="text-xs text-sr-text-muted">Posts show up here once shared.</p>
        </div>
      ) : subTab === 'media' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {activePosts.map(post => (
            <div key={post.id} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-sr-surface border border-sr-border">
              {post.media_type === 'photo' ? (
                <img src={post.media_url!} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              ) : (
                // #t=0.1 forces a cover frame to actually render on load —
                // without a time fragment, iOS Safari leaves the <video>
                // blank until playback starts (desktop Chrome auto-decodes
                // a frame so this looked fine there, but not on mobile).
                <video src={`${post.media_url!}#t=0.1`} className="absolute inset-0 w-full h-full object-cover" muted playsInline preload="metadata" />
              )}
              {post.media_type === 'video' && (
                <div className="absolute bottom-1.5 left-1.5">
                  <Play className="h-3.5 w-3.5 text-white fill-white drop-shadow" />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {activePosts.map(post => (
            <div key={post.id} className="card-premium p-4">
              <p className="text-sm text-sr-silver whitespace-pre-wrap">{post.caption}</p>
              <p className="text-xs text-sr-text-muted mt-2">{new Date(post.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Competition level — used both on the stat submission form and by the AI
// scoring system to weigh a result against how competitive the setting was.
// Ordered lowest to highest so it can double as a numeric scale if needed.
const COMPETITION_LEVEL_OPTIONS = [
  { value: 'recreational', label: 'Recreational / Social' },
  { value: 'school_club',  label: 'School / Club' },
  { value: 'regional',     label: 'Regional / District' },
  { value: 'state',        label: 'State / Provincial' },
  { value: 'national',     label: 'National' },
  { value: 'international', label: 'International / Elite' },
];

// ── STATS ────────────────────────────────────────────

function StatsTab({ isOwner, profileId, ownerRole }: { isOwner: boolean; profileId: string; ownerRole?: string }) {
  const { profile: currentProfile } = useAuth();
  const canSubmit = isOwner && ownerRole === 'athlete';
  const [stats, setStats] = useState<(AthleteStat & { stat_event_types: StatEventType | null })[]>([]);
  const [eventTypes, setEventTypes] = useState<StatEventType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSport, setSelectedSport] = useState('');
  const [selectedEventTypeId, setSelectedEventTypeId] = useState('');
  const [statValue, setStatValue] = useState('');
  const [competitionLevel, setCompetitionLevel] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [evidenceUploadPercent, setEvidenceUploadPercent] = useState(0);
  const evidenceFileRef = useRef<HTMLInputElement>(null);
  // Custom event fields — active when selectedEventTypeId === '__custom__' or sport === 'other'
  const [customSportName, setCustomSportName] = useState('');
  const [customEventName, setCustomEventName] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<(AthleteStat & { stat_event_types: StatEventType | null }) | null>(null);
  const [viewingEvidence, setViewingEvidence] = useState<(AthleteStat & { stat_event_types: StatEventType | null }) | null>(null);
  const [reportingEvidence, setReportingEvidence] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportError, setReportError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const isCustomEvent = selectedEventTypeId === '__custom__';
  const isOtherSport  = selectedSport === 'other';

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const stat = deleteTarget;
    const wasVerified = stat.verification_status === 'verified';
    const sport = stat.stat_event_types?.sport ?? null;

    // Delete the DB row first.
    const { error: delErr } = await supabase
      .from('athlete_stats')
      .delete()
      .eq('id', stat.id)
      .eq('profile_id', profileId); // belt-and-suspenders: only own stats
    if (delErr) {
      setError(`Could not delete stat: ${delErr.message}`);
      setIsDeleting(false);
      setDeleteTarget(null);
      return;
    }

    // Remove from local state immediately.
    setStats(prev => prev.filter(s => s.id !== stat.id));
    setDeleteTarget(null);
    setIsDeleting(false);

    // Clean up storage evidence if present.
    if (stat.evidence_url) {
      try {
        // Extract the path after '/stat-evidence/' in the public URL.
        const marker = '/stat-evidence/';
        const idx = stat.evidence_url.indexOf(marker);
        if (idx !== -1) {
          const storagePath = stat.evidence_url.slice(idx + marker.length);
          await supabase.storage.from('stat-evidence').remove([storagePath]);
        }
      } catch {
        // Storage cleanup failure is non-fatal — DB row is already deleted.
      }
    }

    // If the stat was verified, trigger score recalculation for the sport.
    // SQL #75 only fires on UPDATE, not DELETE, so we call the scoring
    // function directly. This is a no-op if the sport has no other verified stats.
    if (wasVerified && sport) {
      await supabase.rpc('refresh_sport_scores', {
        p_sport: sport,
        p_trigger_reason: 'stat_deleted',
      }).then(({ error: rpcErr }) => {
        if (rpcErr) console.error('Score recalculation after stat deletion failed:', rpcErr.message);
      });
    }
  };

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPhotoOrVideo = file.type.startsWith('image/') || file.type.startsWith('video/');
    if (!isPhotoOrVideo) { setError('Evidence must be a photo or video file.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large (${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB). Maximum is 4GB.`);
      return;
    }
    setIsUploadingEvidence(true);
    setEvidenceUploadPercent(0);
    setError('');
    try {
      const isPhoto = file.type.startsWith('image/');
      const fileToUpload = isPhoto ? await compressImage(file) : file;
      const ext = isPhoto ? 'jpg' : (file.name.split('.').pop() ?? 'bin');
      const path = `${profileId}/${Date.now()}.${ext}`;
      // Resumable/chunked upload — survives network hiccups (resumes
      // instead of restarting from zero) and reports real progress,
      // instead of one fragile all-or-nothing request that can silently
      // fail partway through on a large video.
      await uploadResumable('stat-evidence', path, fileToUpload, {
        contentType: fileToUpload.type,
        onProgress: p => setEvidenceUploadPercent(p.percent),
      });
      setEvidenceUrl(publicUrlFor('stat-evidence', path));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Upload failed: ${msg}`);
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  // Catalog of measurable events, fetched once — populates the sport/
  // event dropdowns. No free-text event names; two athletes recording
  // "100m" vs "100m sprint" would otherwise silently fragment what
  // should be a single shared leaderboard.
  useEffect(() => {
    supabase.from('stat_event_types').select('*').order('sport').order('label').then(({ data, error: typesError }) => {
      if (typesError) { console.error('Failed to load stat event types:', typesError.message); return; }
      const loaded = (data as StatEventType[] | null) ?? [];
      setEventTypes(loaded);
      // Default to a sport that actually has events when possible, so
      // the form doesn't open straight into the empty state — but fall
      // back to the first canonical sport if none are seeded yet.
      const sportWithData = SPORT_OPTIONS.find(s => loaded.some(e => e.sport === s.value));
      const defaultSport = sportWithData?.value ?? SPORT_OPTIONS[0]?.value ?? '';
      setSelectedSport(defaultSport);
      const firstEvent = loaded.find(e => e.sport === defaultSport);
      if (firstEvent) setSelectedEventTypeId(firstEvent.id);
    });
  }, []);

  const loadStats = () => {
    setIsLoading(true);
    supabase
      .from('athlete_stats')
      .select('*, stat_event_types(*)')
      .eq('profile_id', profileId)
      .order('event_date', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) console.error('Failed to load stats:', loadError.message);
        setStats((data as unknown as (AthleteStat & { stat_event_types: StatEventType })[] | null) ?? []);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadStats();
  }, [profileId]);

  // Sport list is the full canonical set, not just whatever sports
  // happen to have seeded events — requirement is to show all
  // supported sports here, with the empty state handling the rest.
  const eventsForSport = useMemo(() => eventTypes.filter(e => e.sport === selectedSport), [eventTypes, selectedSport]);

  // If the sport changes: fall back to the first event under the new
  // sport if the current selection doesn't belong to it, or clear the
  // selection entirely if the new sport has no events at all (rather
  // than leaving a stale id pointing at the previous sport's event).
  useEffect(() => {
    if (eventsForSport.length > 0) {
      if (!eventsForSport.some(e => e.id === selectedEventTypeId)) {
        setSelectedEventTypeId(eventsForSport[0].id);
      }
    } else {
      setSelectedEventTypeId('');
    }
  }, [eventsForSport]);

  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isReviewingEvidence, setIsReviewingEvidence] = useState(false);
  const [aiVerdict, setAiVerdict] = useState<
    | { status: 'verified'; reasoning: string; score?: number }
    | { status: 'disputed'; reasoning: string }
    | { status: 'error'; error: string }
    | null
  >(null);
  const [duplicateStat, setDuplicateStat] = useState<{
    id: string; value: number; event_date: string; verification_status: string;
    unit: string; label: string;
  } | null>(null);

  const resetForm = () => {
    setStatValue(''); setCompetitionLevel(''); setEvidenceUrl(null); setEvidenceDescription('');
    setShowAdd(false); setDuplicateStat(null); setSubmitSuccess(false);
    setCustomSportName(''); setCustomEventName(''); setCustomUnit('');
  };

  const doInsert = async () => {
    const numericValue = Number(statValue);
    setIsSaving(true);
    setError('');
    setAiVerdict(null);
    const isCustom = isCustomEvent || isOtherSport;
    const matchedEventType = eventTypes.find(e => e.id === selectedEventTypeId);
    const sport = isCustom ? (isOtherSport ? customSportName.trim() : selectedSport) : (matchedEventType?.sport ?? selectedSport);
    const eventLabel = isCustom ? customEventName.trim() : (matchedEventType?.label ?? '');
    const unit = isCustom ? customUnit.trim() : (matchedEventType?.unit ?? '');

    const payload: Record<string, unknown> = {
      profile_id:    profileId,
      value:         numericValue,
      event_date:    eventDate,
      evidence_url:  evidenceUrl,
      evidence_description: evidenceDescription.trim(),
      competition_level: competitionLevel,
    };
    if (isCustom) {
      payload.stat_event_type_id = null;
      payload.custom_sport       = sport;
      payload.custom_event_name  = eventLabel;
      payload.custom_unit        = unit;
    } else {
      payload.stat_event_type_id = selectedEventTypeId;
    }
    const { data: inserted, error: insertError } = await supabase.from('athlete_stats').insert(payload).select('id').single();
    setIsSaving(false);
    if (insertError || !inserted) {
      console.error('Failed to add stat:', insertError?.message);
      setError('Something went wrong saving this. Please try again.');
      return;
    }

    setSubmitSuccess(true);
    resetForm();
    loadStats();

    // AI evidence + scoring pipeline runs right after submission — no
    // admin step. See processNewStatSubmission for the honest caveats on
    // what this can and can't actually verify from still frames.
    setIsReviewingEvidence(true);
    const mediaType: 'photo' | 'video' = (evidenceUrl ?? '').match(/\.(mp4|mov|webm|m4v)(\?|$)/i) ? 'video' : 'photo';
    const outcome = await processNewStatSubmission({
      statId: (inserted as { id: string }).id,
      mediaUrl: evidenceUrl!,
      mediaType,
      description: evidenceDescription.trim(),
      sport, eventLabel, unit, value: numericValue,
      competitionLevel,
    });
    setIsReviewingEvidence(false);

    if (outcome.status === 'error') {
      setAiVerdict({ status: 'error', error: outcome.error });
    } else if (outcome.status === 'disputed') {
      setAiVerdict({ status: 'disputed', reasoning: outcome.reasoning });
    } else {
      setAiVerdict({ status: 'verified', reasoning: outcome.reasoning, score: outcome.score ?? undefined });
    }
    loadStats();
  };

  const handleAdd = async () => {
    if (isSaving) return;
    const numericValue = Number(statValue);
    if (!statValue.trim() || Number.isNaN(numericValue)) { setError('Please enter a valid number.'); return; }
    if (!evidenceUrl) { setError('Photo or video evidence is required before submitting a stat.'); return; }
    const isCustom = isCustomEvent || isOtherSport;
    if (isCustom) {
      if (!customEventName.trim()) { setError('Please enter the event or stat name.'); return; }
      if (!customUnit.trim()) { setError('Please enter a unit for this stat.'); return; }
      if (isOtherSport && !customSportName.trim()) { setError('Please enter the sport name.'); return; }
    } else {
      if (!selectedEventTypeId) { setError('Please select an event type.'); return; }
    }
    if (!isCustom) {
      // Duplicate check for standard events only
      const eventDateOnly = eventDate.slice(0, 10);
      const { data: existing } = await supabase
        .from('athlete_stats')
        .select('id, value, event_date, verification_status, stat_event_types(label, unit)')
        .eq('profile_id', profileId)
        .eq('stat_event_type_id', selectedEventTypeId)
        .eq('value', numericValue)
        .gte('event_date', eventDateOnly)
        .lt('event_date', new Date(new Date(eventDateOnly).getTime() + 86400000).toISOString().slice(0, 10))
        .in('verification_status', ['pending', 'verified'])
        .limit(1);
      if (existing && existing.length > 0) {
        const row = existing[0] as {
          id: string; value: number; event_date: string; verification_status: string;
          stat_event_types: { label: string; unit: string } | null;
        };
        setDuplicateStat({
          id: row.id, value: row.value, event_date: row.event_date,
          verification_status: row.verification_status,
          label: row.stat_event_types?.label ?? 'Unknown event',
          unit: row.stat_event_types?.unit ?? '',
        });
        return;
      }
    }
    await doInsert();
  };

  if (isLoading) {
    return <div className="card-premium p-12 text-center text-sm text-sr-text-muted">Loading stats...</div>;
  }

  // Success banner shown after a stat is submitted
  if (submitSuccess) {
    setTimeout(() => setSubmitSuccess(false), 5000);
  }

  if (stats.length === 0 && !showAdd) {
    return (
      <div className="rounded-2xl border border-dashed border-sr-border-light bg-sr-surface p-12 text-center">
        <div className="h-12 w-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center">
          <BarChart3 className="h-6 w-6 text-sr-purple-light" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Track your first result</h3>
        <p className="text-sm text-sr-text-muted mb-4">
          {isOwner ? 'Every sport, every event, all in one place.' : 'No stats recorded yet.'}
        </p>
        {isOwner && eventTypes.length > 0 && (
          <Button variant="brand" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(true)}>Add Stat</Button>
        )}
      </div>
    );
  }

  // Personal best: the best value (direction-aware, per the event's own
  // higher_is_better flag) among this athlete's OWN stats for that exact
  // event type — computed here, not stored, so it's always correct
  // against whatever's currently loaded. Only ever compared among VERIFIED
  // stats — a pending stat hasn't been confirmed yet and a rejected/disputed
  // one has been rejected or is still being argued about, so none of those
  // should be able to carry the "Personal Best" badge even if their raw
  // value happens to be the best on record.
  const personalBestIds = new Set<string>();
  for (const et of eventTypes) {
    const rowsForEvent = stats.filter(s => s.stat_event_type_id === et.id && s.verification_status === 'verified');
    if (rowsForEvent.length === 0) continue;
    const best = rowsForEvent.reduce((acc, cur) =>
      (et.higher_is_better ? cur.value > acc.value : cur.value < acc.value) ? cur : acc
    );
    personalBestIds.add(best.id);
  }

  const statusStyles: Record<string, string> = {
    pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    verified: 'text-green-400 bg-green-400/10 border-green-400/20',
    rejected: 'text-red-400 bg-red-400/10 border-red-400/20',
    disputed: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  };

  return (
    <div className="space-y-4">
      {submitSuccess && !isReviewingEvidence && !aiVerdict && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
          <Check className="h-4 w-4 flex-shrink-0" /> Submitted!
        </div>
      )}
      {isReviewingEvidence && (
        <div className="p-3 rounded-lg bg-sr-purple/10 border border-sr-purple/20 text-sr-purple-light text-sm flex items-center gap-2">
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" /> AI is reviewing your evidence — this can take a moment, especially for video...
        </div>
      )}
      {aiVerdict?.status === 'verified' && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <p className="flex items-center gap-2 font-medium"><Check className="h-4 w-4 flex-shrink-0" /> Verified{aiVerdict.score != null ? ` — scored ${aiVerdict.score.toFixed(2)}` : ''}</p>
          <p className="text-xs text-green-400/80 mt-1">{aiVerdict.reasoning}</p>
        </div>
      )}
      {aiVerdict?.status === 'disputed' && (
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
          <p className="flex items-center gap-2 font-medium"><Clock className="h-4 w-4 flex-shrink-0" /> Sent for human review</p>
          <p className="text-xs text-blue-400/80 mt-1">{aiVerdict.reasoning}</p>
        </div>
      )}
      {aiVerdict?.status === 'error' && (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
          <p className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 flex-shrink-0" /> Couldn't complete review</p>
          <p className="text-xs text-yellow-400/80 mt-1">{aiVerdict.error}</p>
        </div>
      )}
      {canSubmit && !showAdd && (
        <div className="flex justify-end">
          <Button variant="brand" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(true)}>Add Stat</Button>
        </div>
      )}
      {canSubmit && showAdd && (
        <div className="card-premium p-5">
          <h4 className="text-sm font-semibold text-white mb-3">Add New Stat</h4>
          {error && (
            <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
          )}
          <div className="grid sm:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="block text-xs text-sr-text-muted mb-1">Sport</label>
              <SearchableSelect value={selectedSport} onChange={v => { setSelectedSport(v); setSelectedEventTypeId(''); }} searchPlaceholder="Search sports..."
                options={SPORT_OPTIONS} />
            </div>
            {isOtherSport ? (
              /* ── Path C: sport = "other" ── full custom fields ── */
              <>
                <div>
                  <label className="block text-xs text-sr-text-muted mb-1">Sport name <span className="text-red-400">*</span></label>
                  <input className="input-dark" placeholder="e.g. Lacrosse" value={customSportName} onChange={e => setCustomSportName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-sr-text-muted mb-1">Event / stat name <span className="text-red-400">*</span></label>
                  <input className="input-dark" placeholder="e.g. 100m sprint" value={customEventName} onChange={e => setCustomEventName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-sr-text-muted mb-1">Result value <span className="text-red-400">*</span></label>
                  <input className="input-dark" type="number" step="any" placeholder="e.g. 11.8" value={statValue} onChange={e => setStatValue(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-sr-text-muted mb-1">Unit <span className="text-red-400">*</span></label>
                  <input className="input-dark" placeholder="e.g. seconds, cm, goals" value={customUnit} onChange={e => setCustomUnit(e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs text-sr-text-muted mb-1">Date</label>
                  <input className="input-dark" type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                </div>
              </>
            ) : eventsForSport.length > 0 ? (
              /* ── Path A/B: known sport — standard or custom event ── */
              <>
                <div>
                  <label className="block text-xs text-sr-text-muted mb-1">Event</label>
                  <SearchableSelect value={selectedEventTypeId} onChange={setSelectedEventTypeId} searchPlaceholder="Search events..."
                    options={[
                      ...eventsForSport.map(et => ({ value: et.id, label: et.label })),
                      { value: '__custom__', label: '— Other event / stat not listed —' },
                    ]} />
                </div>
                {isCustomEvent ? (
                  /* ── Path B: custom event within known sport ── */
                  <>
                    <div>
                      <label className="block text-xs text-sr-text-muted mb-1">Event / stat name <span className="text-red-400">*</span></label>
                      <input className="input-dark" placeholder="e.g. Standing broad jump" value={customEventName} onChange={e => setCustomEventName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-sr-text-muted mb-1">Result value <span className="text-red-400">*</span></label>
                      <input className="input-dark" type="number" step="any" placeholder="e.g. 245" value={statValue} onChange={e => setStatValue(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-sr-text-muted mb-1">Unit <span className="text-red-400">*</span></label>
                      <input className="input-dark" placeholder="e.g. cm, seconds, goals" value={customUnit} onChange={e => setCustomUnit(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-sr-text-muted mb-1">Date</label>
                      <input className="input-dark" type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                    </div>
                  </>
                ) : (
                  /* ── Path A: standard event selected ── */
                  <>
                    <div>
                      <label className="block text-xs text-sr-text-muted mb-1">
                        Value {selectedEventTypeId && `(${eventTypes.find(e => e.id === selectedEventTypeId)?.unit})`}
                      </label>
                      <input className="input-dark" type="number" step="any" placeholder="e.g. 11.8" value={statValue} onChange={e => setStatValue(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-sr-text-muted mb-1">Date</label>
                      <input className="input-dark" type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="sm:col-span-3">
                <SportComingSoon sport={selectedSport} compact />
              </div>
            )}
          </div>

          <div className="mb-3 max-w-xs">
            <label className="block text-xs text-sr-text-muted mb-1">
              Competition Level <span className="text-red-400">*</span>
            </label>
            <Select value={competitionLevel} onChange={setCompetitionLevel} className="w-full"
              options={COMPETITION_LEVEL_OPTIONS} placeholder="Select the level this was achieved at" />
            {/* Shorter copy below sm — the full sentence wrapped onto 3-4
                lines on a phone and made the form feel dense; same info,
                fewer words. Desktop keeps the original full sentence. */}
            <p className="text-xs text-sr-text-muted mt-1 sm:hidden">Affects your ScoutRank score.</p>
            <p className="text-xs text-sr-text-muted mt-1 hidden sm:block">
              How competitive was the setting? This affects your ScoutRank score alongside the result itself.
            </p>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-sr-text-muted mb-1">
              Describe yourself in the footage <span className="text-red-400">*</span>
            </label>
            <textarea
              value={evidenceDescription}
              onChange={e => setEvidenceDescription(e.target.value)}
              rows={2}
              className="input-dark w-full resize-none"
              placeholder="e.g. I'm wearing guernsey #7, no headgear, dark hair in a ponytail — playing forward for the blue team."
            />
            <p className="text-xs text-sr-text-muted mt-1 sm:hidden">Used to verify your evidence — jersey #, headgear, appearance.</p>
            <p className="text-xs text-sr-text-muted mt-1 hidden sm:block">
              Jersey/guernsey number, headgear (and colour if worn), and a brief description of what you look like — this is what AI checks your evidence against.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap items-start">
            {/* Evidence upload — required before submission */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-sr-text-muted mb-1.5">
                Evidence <span className="text-red-400">*</span> <span className="text-sr-text-muted font-normal">(photo or video, up to 4GB)</span>
              </label>
              <button type="button" onClick={() => evidenceFileRef.current?.click()}
                disabled={isUploadingEvidence}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                  evidenceUrl
                    ? 'border-green-500/40 bg-green-500/10 text-green-400'
                    : 'border-dashed border-sr-border text-sr-text-muted hover:border-sr-purple/50'
                }`}>
                {isUploadingEvidence
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading... {evidenceUploadPercent}%</>
                  : evidenceUrl
                  ? <><Check className="h-4 w-4" /> Evidence attached</>
                  : <><Upload className="h-4 w-4" /> Upload evidence</>}
              </button>
              {isUploadingEvidence && (
                <div className="mt-1.5 h-1.5 w-full max-w-xs rounded-full bg-sr-border overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sr-purple to-sr-blue transition-all duration-200"
                    style={{ width: `${evidenceUploadPercent}%` }}
                  />
                </div>
              )}
              <input ref={evidenceFileRef} type="file" accept="image/*,video/*"
                onChange={handleEvidenceUpload} className="hidden" />
              {!evidenceUrl && !isUploadingEvidence && (
                <>
                  <p className="text-xs text-sr-text-muted mt-1 sm:hidden">Required for verification. Large videos upload in the background.</p>
                  <p className="text-xs text-sr-text-muted mt-1 hidden sm:block">Required — proof is needed for admin verification. Large videos upload in the background and will resume automatically if your connection drops.</p>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="brand" size="sm" onClick={handleAdd}
              disabled={
                !statValue.trim() || !evidenceUrl || !competitionLevel || !evidenceDescription.trim() || isSaving ||
                (!isCustomEvent && !isOtherSport && eventsForSport.length === 0) ||
                ((isCustomEvent || isOtherSport) && (!customEventName.trim() || !customUnit.trim())) ||
                (isOtherSport && !customSportName.trim())
              }
              icon={isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
              {isSaving ? 'Submitting...' : 'Submit for Review'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setError(''); setEvidenceUrl(null); setCustomSportName(''); setCustomEventName(''); setCustomUnit(''); }}>Cancel</Button>
          </div>
        </div>
      )}
      {/* Stats grouped by verification status */}
      {(['verified', 'pending', 'disputed', 'rejected'] as const).map(status => {
        const group = stats.filter(s => s.verification_status === status);
        if (group.length === 0) return null;
        const statusConfig = {
          verified: { label: 'Verified', badge: 'text-green-400 bg-green-400/10 border-green-400/20', note: '' },
          pending:  { label: 'Pending Review', badge: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', note: 'Awaiting verification — will not affect ScoutRank until approved' },
          disputed: { label: 'Under Review', badge: 'text-blue-400 bg-blue-400/10 border-blue-400/20', note: 'Our AI flagged this for a closer look — a person will make the final call' },
          rejected: { label: 'Not Verified', badge: 'text-red-400 bg-red-400/10 border-red-400/20', note: 'These results were not accepted' },
        }[status];
        return (
          <div key={status} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${statusConfig.badge}`}>
                {statusConfig.label}
              </span>
              <span className="text-xs text-sr-text-muted">{group.length}</span>
              {statusConfig.note && <span className="text-xs text-sr-text-muted">— {statusConfig.note}</span>}
            </div>
            <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${status === 'rejected' || status === 'disputed' ? 'opacity-60' : ''}`}>
        {group.map(s => {
          const SportIcon = getSportIcon(s.stat_event_types?.sport ?? s.custom_sport ?? 'other');
          const isPB = personalBestIds.has(s.id);
          return (
            <div key={s.id} className="relative rounded-2xl border border-sr-border bg-gradient-to-br from-sr-surface to-sr-surface-light p-5 overflow-hidden hover:border-sr-border-light transition-colors">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-sr-purple to-sr-blue opacity-70" />
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center flex-shrink-0">
                    <SportIcon className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-xs text-sr-text-muted">
                    {s.stat_event_types
                      ? `${formatSportName(s.stat_event_types.sport)} · ${s.stat_event_types.label}`
                      : `${s.custom_sport ? formatSportName(s.custom_sport) : 'Custom'} · ${s.custom_event_name ?? 'Custom event'}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${statusStyles[s.verification_status]}`}>
                    {s.verification_status}
                  </span>
                  {isOwner && (
                    <button onClick={() => setDeleteTarget(s)}
                      className="p-1 rounded text-sr-text-muted hover:text-red-400 transition-colors"
                      title="Delete stat">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-3xl font-bold font-display gradient-text-brand">
                {s.value}<span className="text-sm text-sr-text-muted font-normal ml-1.5">{s.stat_event_types?.unit ?? s.custom_unit ?? ''}</span>
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-sr-text-muted">{shortDate(s.event_date)}{s.age_group && ` · ${s.age_group}`}</span>
                {isPB && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide bg-sr-purple/15 text-sr-purple-light">
                    Personal Best
                  </span>
                )}
              </div>
              {s.evidence_url && (
                <button
                  onClick={() => setViewingEvidence(s)}
                  className="mt-2 text-[11px] text-sr-purple-light hover:text-white flex items-center gap-1"
                >
                  <Play className="h-3 w-3" /> View Evidence
                </button>
              )}
              {s.verification_status === 'pending' && (
                <p className="text-[11px] text-sr-text-muted mt-2">
                  Pending stats do not affect your ScoutRank score.
                </p>
              )}
              {s.verification_status === 'disputed' && s.rejection_reason && (
                <div className="mt-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                  <p className="text-[11px] text-blue-400 font-semibold mb-0.5">Why it's under review</p>
                  <p className="text-[11px] text-sr-text-muted">{s.rejection_reason}</p>
                </div>
              )}
              {s.verification_status === 'rejected' && s.rejection_reason && (
                <div className="mt-2 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                  <p className="text-[11px] text-red-400 font-semibold mb-0.5">Reason for rejection</p>
                  <p className="text-[11px] text-sr-text-muted">{s.rejection_reason}</p>
                </div>
              )}
              {s.verification_status === 'rejected' && isOwner && (
                <button
                  className="mt-2 text-[11px] text-sr-purple-light hover:underline"
                  onClick={() => {
                    if (s.stat_event_type_id) setSelectedEventTypeId(s.stat_event_type_id);
                    setStatValue(String(s.value));
                    setEventDate(s.event_date.slice(0, 10));
                    setShowAdd(true);
                  }}
                >
                  Resubmit with corrections →
                </button>
              )}
            </div>
          );
        })}
            </div>
          </div>
        );
      })}

      {/* Duplicate stat warning modal */}
      {duplicateStat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card-premium p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-yellow-400/10 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-yellow-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Possible duplicate stat</h3>
            </div>
            <p className="text-sm text-sr-text-muted">
              You already submitted this same result for this event and date. Are you sure you want to submit it again?
            </p>
            {/* Existing matching submission */}
            <div className="rounded-lg bg-sr-surface border border-sr-border p-3 space-y-1.5 text-xs">
              <p className="text-sr-text-muted font-semibold uppercase tracking-wide text-[10px]">Existing submission</p>
              <div className="flex justify-between">
                <span className="text-sr-text-muted">Event</span>
                <span className="text-sr-silver">{duplicateStat.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sr-text-muted">Result</span>
                <span className="text-white font-semibold">{duplicateStat.value} {duplicateStat.unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sr-text-muted">Date</span>
                <span className="text-sr-silver">{new Date(duplicateStat.event_date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sr-text-muted">Status</span>
                <span className={`font-semibold capitalize ${
                  duplicateStat.verification_status === 'verified' ? 'text-green-400' : 'text-yellow-400'
                }`}>{duplicateStat.verification_status}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" size="sm"
                onClick={() => setDuplicateStat(null)}
                disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="brand" size="sm"
                onClick={doInsert}
                disabled={isSaving}
                icon={isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
                {isSaving ? 'Submitting...' : 'Submit Anyway'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card-premium p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Delete this stat?</h3>
            </div>
            <p className="text-sm text-sr-text-muted leading-relaxed">
              This will permanently remove this result and any evidence attached to it.
              {deleteTarget.verification_status === 'verified' && (
                <span className="block mt-1 text-yellow-400">
                  This stat is verified. Deleting it will recalculate your ScoutRank score and rankings for {deleteTarget.stat_event_types?.sport ?? 'this sport'}.
                </span>
              )}
            </p>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-3">
              <Button variant="ghost" size="sm" onClick={() => { setDeleteTarget(null); setError(''); }} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={isDeleting}
                icon={isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}>
                {isDeleting ? 'Deleting...' : 'Delete Stat'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence viewer — visible to anyone, since transparency here is
          the whole point: if the AI misread something, other people
          actually being able to look at the footage themselves is what
          makes reporting a fake stat possible in the first place. */}
      {viewingEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => { setViewingEvidence(null); setReportingEvidence(false); setReportSubmitted(false); setReportReason(''); setReportError(''); }}>
          <div className="card-premium max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-sr-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Evidence</p>
                <p className="text-xs text-sr-text-muted">
                  {viewingEvidence.value} {viewingEvidence.stat_event_types?.unit ?? viewingEvidence.custom_unit ?? ''} — {viewingEvidence.stat_event_types?.label ?? viewingEvidence.custom_event_name}
                </p>
              </div>
              <button onClick={() => { setViewingEvidence(null); setReportingEvidence(false); setReportSubmitted(false); }} className="text-sr-text-muted hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-black flex items-center justify-center max-h-[50vh]">
              {/^.*\.(mp4|mov|webm|m4v)(\?|$)/i.test(viewingEvidence.evidence_url ?? '') ? (
                <video src={viewingEvidence.evidence_url ?? ''} controls className="max-h-[50vh] w-full" />
              ) : (
                <img src={viewingEvidence.evidence_url ?? ''} alt="" className="max-h-[50vh] w-full object-contain" />
              )}
            </div>

            {viewingEvidence.evidence_description && (
              <p className="p-4 text-xs text-sr-silver border-b border-sr-border">
                Athlete's description: "{viewingEvidence.evidence_description}"
              </p>
            )}

            <div className="p-4">
              {reportSubmitted ? (
                <div className="text-center py-2">
                  <p className="text-sm text-green-400 font-semibold">Report submitted</p>
                  <p className="text-xs text-sr-text-muted mt-1">An admin will review this evidence.</p>
                </div>
              ) : reportingEvidence ? (
                <div>
                  <label className="block text-xs text-sr-text-muted mb-1.5">Why are you reporting this?</label>
                  {reportError && <p className="text-xs text-red-400 mb-2">{reportError}</p>}
                  <textarea
                    value={reportReason}
                    onChange={e => setReportReason(e.target.value)}
                    rows={3}
                    className="input-dark w-full resize-none text-sm mb-3"
                    placeholder="e.g. footage doesn't match the claimed sport, jersey number doesn't match, looks staged/edited..."
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setReportingEvidence(false)} className="flex-1 text-xs px-3 py-2 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!reportReason.trim()) { setReportError('Please explain why.'); return; }
                        if (!currentProfile) return;
                        setReportSubmitting(true);
                        setReportError('');
                        const { error: err } = await supabase.from('stat_evidence_reports').insert({
                          stat_id: viewingEvidence.id,
                          reporter_id: currentProfile.id,
                          reason: reportReason.trim(),
                        });
                        setReportSubmitting(false);
                        if (err) { setReportError(err.message); return; }
                        setReportSubmitted(true);
                      }}
                      disabled={reportSubmitting}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {reportSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />} Submit Report
                    </button>
                  </div>
                </div>
              ) : currentProfile && currentProfile.id !== viewingEvidence.profile_id ? (
                <button onClick={() => setReportingEvidence(true)} className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <Flag className="h-3.5 w-3.5" /> Report this evidence
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── HIGHLIGHTS ───────────────────────────────────────
interface HighlightItem {
  id: string;
  title: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  createdAt: string;
}

function HighlightsTab({ isOwner, profileId, profileName }: { isOwner: boolean; profileId: string; profileName: string }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<'image' | 'video'>('image');
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // This tab used to never load existing highlights at all — `highlights`
  // only ever grew from `hl-${Date.now()}` items appended locally after a
  // fresh upload in the current session, so a page refresh (or any other
  // visitor) always saw an empty tab regardless of how much was actually
  // uploaded. It also saved new highlights with `sport_tag: 'highlight'`
  // instead of `post_type: 'highlight'`, so nothing was tagged in a way this
  // query could find anyway. Matching on EITHER field picks up both the
  // mistagged historical rows and correctly-tagged new ones below.
  const load = () => {
    setIsLoading(true);
    supabase.from('posts').select('id, caption, media_url, media_type, created_at')
      .eq('profile_id', profileId)
      .or('post_type.eq.highlight,sport_tag.eq.highlight')
      .order('created_at', { ascending: false })
      .then(({ data, error: e }) => {
        if (e) console.error('Failed to load highlights:', e.message);
        const rows = (data as { id: string; caption: string | null; media_url: string | null; media_type: string | null; created_at: string }[] | null) ?? [];
        setHighlights(
          rows.filter(r => r.media_url).map(r => ({
            id: r.id,
            title: r.caption || 'Highlight',
            mediaUrl: r.media_url as string,
            mediaType: r.media_type === 'video' ? 'video' : 'image',
            createdAt: r.created_at,
          }))
        );
        setIsLoading(false);
      });
  };
  useEffect(() => { load(); }, [profileId]);

  const handleDeleteHighlight = async (hl: HighlightItem) => {
    if (deletingId) return;
    setDeletingId(hl.id);
    const { error: delErr } = await supabase.from('posts').delete().eq('id', hl.id).eq('profile_id', profileId);
    if (delErr) {
      console.error('Failed to delete highlight:', delErr.message);
      setDeletingId(null);
      return;
    }
    setHighlights(prev => prev.filter(h => h.id !== hl.id));
    setDeletingId(null);
    // Best-effort storage cleanup, same non-fatal pattern as stat evidence —
    // the DB row (which is what every other view actually reads) is already gone.
    try {
      const marker = '/post-media/';
      const idx = hl.mediaUrl.indexOf(marker);
      if (idx !== -1) {
        await supabase.storage.from('post-media').remove([hl.mediaUrl.slice(idx + marker.length)]);
      }
    } catch {
      // non-fatal
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);

  // A video/photo recorded via the dedicated /record-highlight page (TikTok-
  // style pause/resume recording) comes back here as a ready-made preview,
  // instead of needing to pass a Blob across a page navigation.
  useEffect(() => {
    const recordedUrl = searchParams.get('recordedUrl');
    const recordedType = searchParams.get('recordedType');
    if (recordedUrl && recordedType) {
      setUploadPreview(decodeURIComponent(recordedUrl));
      setUploadType(recordedType === 'photo' ? 'image' : 'video');
      setShowUpload(true);
      const next = new URLSearchParams(searchParams);
      next.delete('recordedUrl');
      next.delete('recordedType');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setError('Please upload a photo or video file.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const kind = file.type.startsWith('image/') ? 'photo' : 'video';
      const url = await uploadMediaBlob(file, profileId, kind);
      setUploadPreview(url);
      setUploadType(file.type.startsWith('image/') ? 'image' : 'video');
    } catch (err) {
      console.error('Highlight upload failed:', err);
      setError(err instanceof Error ? err.message : 'Could not upload this file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handlePost = async () => {
    if (!uploadPreview || isPosting) return;
    setIsPosting(true);
    const mediaType = uploadType === 'image' ? 'photo' : 'video';
    const { data: insertedPost, error } = await supabase.from('posts').insert({
      profile_id: profileId,
      // Was `sport_tag: 'highlight'` — post_type is the field every other
      // page (Explore, Performance Passport) actually filters on to find
      // highlights, so this was the reason none of them ever surfaced there.
      post_type: 'highlight',
      caption: uploadTitle || 'New highlight!',
      media_url: uploadPreview,
      media_type: mediaType,
    }).select('id').single();
    setIsPosting(false);
    if (error) {
      console.error('Failed to post highlight to feed:', error.message);
      setError('Something went wrong posting this. Please try again.');
      return;
    }
    if (insertedPost) triggerPostModeration((insertedPost as { id: string }).id, uploadPreview, mediaType);
    setShowUpload(false);
    setUploadPreview(null);
    setUploadTitle('');
    setError('');
    load(); // refresh from the DB so the new highlight shows up with its real id (needed to delete it later)
  };

  if (isLoading) {
    return <div className="card-premium p-12 text-center text-sm text-sr-text-muted">Loading highlights...</div>;
  }

  if (highlights.length === 0 && !showUpload) {
    return (
      <div className="card-premium p-12 text-center">
        <Video className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No Highlights Yet</h3>
        <p className="text-sm text-sr-text-muted mb-4">
          {isOwner ? 'Upload game footage and media to showcase your skills.' : `No highlights uploaded by ${profileName} yet.`}
        </p>
        {isOwner && (
          <Button variant="brand" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setShowUpload(true)}>
            Upload Highlight
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <Button variant="brand" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setShowUpload(true)}>
            Upload Highlight
          </Button>
        </div>
      )}

      {showUpload && (
        <div className="card-premium p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-white">Upload Highlight</h4>
            <button onClick={() => { setShowUpload(false); setUploadPreview(null); setError(''); }}>
              <X className="h-4 w-4 text-sr-text-muted hover:text-white" />
            </button>
          </div>
          {error && <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>}
          <div className="mb-3">
            <label className="block text-xs text-sr-text-muted mb-1">Title (optional)</label>
            <input className="input-dark" placeholder="e.g. State Championship Goal" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
          </div>
          {uploadPreview ? (
            <div className="mb-3 relative rounded-xl overflow-hidden border border-sr-border">
              {uploadType === 'image'
                ? <img src={uploadPreview} alt="" className="w-full max-h-64 object-cover" />
                : <video src={uploadPreview} controls className="w-full max-h-64" />}
              <button onClick={() => setUploadPreview(null)}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-sr-border rounded-xl p-6 text-center hover:border-sr-purple/50 transition-colors">
                {uploading
                  ? <Loader2 className="h-6 w-6 mx-auto text-sr-text-muted animate-spin" />
                  : <>
                    <Upload className="h-6 w-6 mx-auto text-sr-text-muted mb-2" />
                    <p className="text-xs text-sr-text-muted">Upload from device</p>
                  </>}
              </button>
              <button onClick={() => navigate(`/record-highlight?returnTo=${encodeURIComponent(`${window.location.pathname}?tab=highlights`)}`)}
                className="border-2 border-dashed border-sr-border rounded-xl p-6 text-center hover:border-sr-purple/50 transition-colors">
                <Camera className="h-6 w-6 mx-auto text-sr-text-muted mb-2" />
                <p className="text-xs text-sr-text-muted">Record now</p>
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleFileChange} className="hidden" />
          <div className="flex gap-2">
            <Button variant="brand" size="sm" disabled={!uploadPreview || isPosting} onClick={handlePost}
              icon={isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
              {isPosting ? 'Posting...' : 'Post Highlight'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} icon={<Camera className="h-4 w-4" />}>
              {uploadPreview ? 'Change File' : 'Browse'}
            </Button>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {highlights.map(hl => (
          <div key={hl.id} className="card-premium overflow-hidden group">
            <div className="relative aspect-video bg-sr-surface">
              {hl.mediaType === 'image'
                ? <img src={hl.mediaUrl} alt={hl.title} className="w-full h-full object-cover" />
                : (
                  <div className="relative w-full h-full">
                    <video src={hl.mediaUrl} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="h-10 w-10 text-white" />
                    </div>
                  </div>
                )}
              {isOwner && (
                <button
                  onClick={() => handleDeleteHighlight(hl)}
                  disabled={deletingId === hl.id}
                  title="Delete highlight"
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100">
                  {deletingId === hl.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-medium text-white">{hl.title}</p>
              <p className="text-xs text-sr-text-muted">{new Date(hl.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ACHIEVEMENTS ─────────────────────────────────────
// Achievements are specialised posts (post_type = 'achievement').
// They read/write the posts table, not the achievements table.
// No scoring contribution. Display only with Achievement badge.
type AchievementPost = {
  id: string; profile_id: string; post_type: string;
  achievement_title: string | null; caption: string | null;
  media_url: string | null; media_type: string | null;
  created_at: string;
};

function AchievementsTab({ isOwner, profileId, profileName }: { isOwner: boolean; profileId: string; profileName: string }) {
  const [items, setItems] = useState<AchievementPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video' | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setIsLoading(true);
    supabase.from('posts').select('*')
      .eq('profile_id', profileId)
      .eq('post_type', 'achievement')
      .order('created_at', { ascending: false })
      .then(({ data, error: e }) => {
        if (e) console.error('Failed to load achievements:', e.message);
        setItems((data as AchievementPost[] | null) ?? []);
        setIsLoading(false);
      });
  };

  useEffect(() => { load(); }, [profileId]);

  const handleMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPhoto = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isPhoto && !isVideo) { setError('Please upload a photo or video.'); return; }
    setIsUploadingMedia(true); setError('');
    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `${profileId}/achievement-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('post-media').upload(path, file, { upsert: true });
    if (upErr) { setError(`Upload failed: ${upErr.message}`); setIsUploadingMedia(false); return; }
    const { data } = supabase.storage.from('post-media').getPublicUrl(path);
    setMediaUrl(data.publicUrl);
    setMediaType(isVideo ? 'video' : 'photo');
    setIsUploadingMedia(false);
  };

  const handleAdd = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return; }
    if (!mediaUrl) { setError('Please attach a photo or video as evidence.'); return; }
    setIsSaving(true); setError('');
    const { data: insertedPost, error: insertErr } = await supabase.from('posts').insert({
      profile_id: profileId,
      post_type: 'achievement',
      achievement_title: title.trim(),
      caption: description.trim() || null,
      media_url: mediaUrl,
      media_type: mediaType,
    }).select('id').single();
    setIsSaving(false);
    if (insertErr) { setError('Could not save achievement. Please try again.'); return; }
    if (insertedPost) triggerPostModeration((insertedPost as { id: string }).id, mediaUrl, mediaType);
    setShowAdd(false);
    setTitle(''); setDescription(''); setMediaUrl(null); setMediaType(null); setError('');
    load();
  };

  // Owner-only — there was previously no way to remove an achievement once
  // posted, even one added by mistake or with the wrong media attached.
  const handleDeleteAchievement = async (item: AchievementPost) => {
    if (deletingId) return;
    setDeletingId(item.id);
    const { error: delErr } = await supabase.from('posts').delete().eq('id', item.id).eq('profile_id', profileId);
    if (delErr) {
      console.error('Failed to delete achievement:', delErr.message);
      setDeletingId(null);
      return;
    }
    setItems(prev => prev.filter(i => i.id !== item.id));
    setDeletingId(null);
    try {
      if (item.media_url) {
        const marker = '/post-media/';
        const idx = item.media_url.indexOf(marker);
        if (idx !== -1) {
          await supabase.storage.from('post-media').remove([item.media_url.slice(idx + marker.length)]);
        }
      }
    } catch {
      // non-fatal — DB row is already gone
    }
  };

  return (
    <div className="space-y-4">
      {isOwner && !showAdd && (
        <div className="flex justify-end">
          <Button variant="brand" size="sm" icon={<Trophy className="h-4 w-4" />} onClick={() => setShowAdd(true)}>
            Add Achievement
          </Button>
        </div>
      )}

      {showAdd && (
        <div className="card-premium p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Add Achievement</h4>
            <button onClick={() => { setShowAdd(false); setError(''); }}><X className="h-4 w-4 text-sr-text-muted hover:text-white" /></button>
          </div>
          {error && <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2"><AlertCircle className="h-3 w-3" />{error}</div>}
          <div>
            <label className="block text-xs text-sr-text-muted mb-1">Title *</label>
            <input className="input-dark" placeholder="e.g. U18 State Champion" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-sr-text-muted mb-1">Description</label>
            <textarea className="input-dark h-16 resize-none" placeholder="Tell the story behind this achievement..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-sr-text-muted mb-1">Photo or video <span className="text-red-400">*</span></label>
            <button onClick={() => fileRef.current?.click()} disabled={isUploadingMedia}
              className={`flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg text-sm transition-colors ${mediaUrl ? 'border-green-500/40 text-green-400' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/50'}`}>
              {isUploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isUploadingMedia ? 'Uploading...' : mediaUrl ? 'Media attached' : 'Upload photo or video'}
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleMedia} className="hidden" />
          </div>
          <div className="flex gap-2">
            <Button variant="brand" size="sm" onClick={handleAdd} disabled={isSaving || !title.trim() || !mediaUrl}
              icon={isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}>
              {isSaving ? 'Posting...' : 'Post Achievement'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setError(''); setMediaUrl(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sr-border-light bg-sr-surface p-12 text-center">
          <Trophy className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
          <p className="text-white font-semibold mb-1">{isOwner ? 'Share your first achievement' : `No achievements yet`}</p>
          <p className="text-sm text-sr-text-muted">
            {isOwner ? 'Post medals, selections, records and milestones.' : `${profileName} hasn't posted any achievements yet.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="card-premium overflow-hidden">
              {/* Achievement badge header */}
              <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400 text-[11px] font-semibold tracking-wide flex-shrink-0">
                    <Trophy className="h-3 w-3" /> Achievement
                  </span>
                  {item.achievement_title && (
                    <p className="text-sm font-semibold text-white truncate">{item.achievement_title}</p>
                  )}
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleDeleteAchievement(item)}
                    disabled={deletingId === item.id}
                    title="Delete achievement"
                    className="p-1 rounded text-sr-text-muted hover:text-red-400 transition-colors flex-shrink-0">
                    {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              {/* Media */}
              {item.media_url && (
                <div className="mx-5 mb-3 rounded-xl overflow-hidden bg-sr-surface border border-sr-border">
                  {item.media_type === 'video'
                    ? <video src={item.media_url} controls className="w-full max-h-64 object-cover" />
                    : <img src={item.media_url} alt="" className="w-full max-h-64 object-cover" />}
                </div>
              )}
              {/* Description */}
              {item.caption && (
                <p className="px-5 pb-3 text-sm text-sr-silver leading-relaxed">{item.caption}</p>
              )}
              <div className="px-5 pb-4">
                <p className="text-xs text-sr-text-muted">{shortDate(item.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Was a hardcoded "Not Yet Ranked" placeholder regardless of the athlete's
// actual rank — contradicting the ScoutRank Score banner above (which
// already reads the real rank from the `rankings` table). Now it reads
// that same rankScore/rankSport/rankPoolCount the banner uses, so the two
// never disagree, and only falls back to the placeholder when the athlete
// genuinely has no ranking row yet.
function RankingsTab({ profileId, rankScore, rankSport, rankPoolCount }: {
  profileId: string; rankScore: number | null; rankSport: string | null; rankPoolCount: number | null;
}) {
  const [position, setPosition] = useState<number | null>(null);

  useEffect(() => {
    if (rankScore === null || !rankSport) { setPosition(null); return; }
    let active = true;
    supabase.from('rankings').select('profile_id, rank_score')
      .eq('sport', rankSport).eq('division', 'Open')
      .order('rank_score', { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        const rows = (data as { profile_id: string; rank_score: number }[]) ?? [];
        const idx = rows.findIndex(r => r.profile_id === profileId);
        setPosition(idx >= 0 ? idx + 1 : null);
      });
    return () => { active = false; };
  }, [profileId, rankScore, rankSport]);

  if (rankScore === null) {
    return (
      <div className="card-premium p-12 text-center">
        <TrendingUp className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Not Yet Ranked</h3>
        <p className="text-sm text-sr-text-muted">Add verified achievements and stats to start climbing the rankings. Rankings are calculated across local, state, national and global levels.</p>
      </div>
    );
  }

  return (
    <div className="card-premium p-8 text-center">
      <TrendingUp className="h-12 w-12 mx-auto text-sr-purple-light mb-4" />
      <div className="text-4xl font-display font-bold gradient-text-brand mb-1">{displayScoutRank(rankScore)}</div>
      <div className="text-xs text-sr-text-muted uppercase tracking-wide mb-4">ScoutRank Score{rankSport ? ` · ${rankSport}` : ''}</div>
      {position !== null && (
        <div className="text-lg font-semibold text-white mb-1">
          #{position}{rankPoolCount !== null && <span className="text-sm text-sr-text-muted font-normal"> of {rankPoolCount}</span>}
        </div>
      )}
      {rankPoolCount !== null && <div className="flex justify-center mt-2"><TrustBadge poolCount={rankPoolCount} /></div>}
    </div>
  );
}

// ── RESUME ───────────────────────────────────────────
function ScoringTab({ profileId }: { profileId: string }) {
  type HistoryRow = {
    rank_score: number | null; previous_rank_score: number | null;
    leaderboard_position: number | null; previous_position: number | null;
    stat_score: number | null; achievement_score: number | null;
    sport: string; division: string; recorded_at: string; trigger_reason: string;
  };
  const ALL_DIVS = ['U12','U13','U14','U15','U16','U17','U18','Open'] as const;
  const PAGE_SIZE = 20;

  const [selectedDivision, setSelectedDivision] = useState<string>('Open');
  const [history, setHistory]       = useState<HistoryRow[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [hasMore, setHasMore]       = useState(false);
  const [page, setPage]             = useState(0);

  // Reset and re-fetch when profileId or division changes
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setHistory([]);
    setPage(0);
    setHasMore(false);

    supabase.from('rank_history')
      .select('rank_score, previous_rank_score, leaderboard_position, previous_position, stat_score, achievement_score, sport, division, recorded_at, trigger_reason')
      .eq('profile_id', profileId)
      .eq('division', selectedDivision)
      .order('recorded_at', { ascending: false })
      .range(0, PAGE_SIZE - 1)
      .then(({ data }) => {
        if (!active) return;
        const rows = (data as HistoryRow[] | null) ?? [];
        setHistory(rows);
        setHasMore(rows.length === PAGE_SIZE);
        setIsLoading(false);
      });

    return () => { active = false; };
  }, [profileId, selectedDivision]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    supabase.from('rank_history')
      .select('rank_score, previous_rank_score, leaderboard_position, previous_position, stat_score, achievement_score, sport, division, recorded_at, trigger_reason')
      .eq('profile_id', profileId)
      .eq('division', selectedDivision)
      .order('recorded_at', { ascending: false })
      .range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1)
      .then(({ data }) => {
        const rows = (data as HistoryRow[] | null) ?? [];
        setHistory(prev => [...prev, ...rows]);
        setHasMore(rows.length === PAGE_SIZE);
      });
  };

  const getMovementState = (h: HistoryRow) => {
    const newlyRanked    = h.previous_rank_score == null && h.rank_score != null;
    const becameUnranked = h.previous_rank_score != null && h.rank_score == null;
    const rawDelta = h.rank_score != null && h.previous_rank_score != null
      ? Number(h.rank_score) - Number(h.previous_rank_score) : null;
    const scoreDelta = rawDelta != null ? Math.round(rawDelta * 100) / 100 : null;
    const posDelta = h.leaderboard_position != null && h.previous_position != null
      ? h.previous_position - h.leaderboard_position : null;
    if (newlyRanked)    return { type: 'newly_ranked',    scoreDelta: null, posDelta: null };
    if (becameUnranked) return { type: 'became_unranked', scoreDelta: null, posDelta: null };
    if (posDelta != null && posDelta > 0) return { type: 'moved_up',   scoreDelta, posDelta };
    if (posDelta != null && posDelta < 0) return { type: 'moved_down', scoreDelta, posDelta };
    return { type: scoreDelta === 0 ? 'no_movement' : 'score_only', scoreDelta, posDelta };
  };

  const triggerLabel = (reason: string) => ({
    stat_verified:      'Stat verified',
    stat_unverified:    'Stat unverified',
    stat_deleted:       'Stat deleted',
    full_recalculation: 'Full recalculation',
    stale_cleanup:      'Stale cleanup',
  } as Record<string,string>)[reason] ?? reason.replace(/_/g, ' ');

  return (
    <div className="space-y-6">
      {/* How scoring works */}
      <div className="card-premium p-6">
        <h2 className="text-lg font-bold text-white mb-1">How ScoutRank Scoring Works</h2>
        <p className="text-sm text-sr-text-muted mb-5">Your ScoutRank score is updated automatically when an admin verifies your stats.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl bg-sr-surface border border-sr-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-5 w-5 text-sr-purple" />
              <p className="text-sm font-semibold text-white">ScoutRank Score <span className="text-sr-text-muted font-normal">(0.00 – 100.00)</span></p>
            </div>
            <p className="text-xs text-sr-text-muted leading-relaxed">Your percentile rank among all athletes with verified official stats in the same event type. The top athlete scores 100.00. Pending and rejected stats contribute nothing. Achievement posts contribute nothing.</p>
          </div>
          <div className="rounded-xl bg-sr-surface border border-sr-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-sr-text-muted" />
              <p className="text-sm font-semibold text-white">Achievements</p>
            </div>
            <p className="text-xs text-sr-text-muted leading-relaxed">Achievements are portfolio content — medals, records, selections and milestones you share with scouts. They appear in your feed and profile but do not affect your ScoutRank score.</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-sr-purple/10 border border-sr-purple/20 p-3 text-xs text-sr-silver">
          <span className="font-semibold text-white">ScoutRank = </span> verified official stat percentile score <span className="text-sr-text-muted ml-1">(0.00 – 100.00 per sport)</span>
        </div>
      </div>

      {/* Score history */}
      <div className="card-premium p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-white">Score History</h3>
          {/* Division filter */}
          <div className="flex flex-wrap gap-1">
            {ALL_DIVS.map(div => (
              <button key={div} onClick={() => setSelectedDivision(div)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                  selectedDivision === div
                    ? 'border-sr-purple bg-sr-purple/15 text-sr-purple-light font-semibold'
                    : 'border-sr-border text-sr-text-muted hover:border-sr-border-light'
                }`}>
                {div}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 text-sr-purple animate-spin" /></div>
        ) : history.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
            <p className="text-sm text-sr-text-muted">No {selectedDivision} division history yet.</p>
            {selectedDivision !== 'Open' && (
              <button onClick={() => setSelectedDivision('Open')}
                className="mt-2 text-xs text-sr-purple-light hover:underline">
                View Open division instead
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((h, i) => {
              const mv = getMovementState(h);
              const scoreDelta = mv.scoreDelta;
              const posDelta   = mv.posDelta;
              const isUp   = mv.type === 'moved_up'   || mv.type === 'newly_ranked';
              const isDown = mv.type === 'moved_down' || mv.type === 'became_unranked';

              const movementLabel = {
                newly_ranked:    'Newly ranked',
                became_unranked: 'Became unranked',
                moved_up:        posDelta != null ? `Moved up ${Math.abs(posDelta)} place${Math.abs(posDelta) !== 1 ? 's' : ''}` : 'Moved up',
                moved_down:      posDelta != null ? `Moved down ${Math.abs(posDelta)} place${Math.abs(posDelta) !== 1 ? 's' : ''}` : 'Moved down',
                no_movement:     'No change',
                score_only:      '',
                unknown:         '',
              }[mv.type];

              return (
                <div key={i} className="rounded-xl border border-sr-border bg-sr-surface p-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white capitalize">
                        {formatSportName(h.sport)}
                        {h.division && h.division !== 'Open' && (
                          <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded border border-sr-border text-sr-text-muted">{h.division}</span>
                        )}
                      </p>
                      <p className="text-xs text-sr-text-muted">{shortDate(h.recorded_at)} · {triggerLabel(h.trigger_reason)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isUp && <TrendUpIcon size={14} className="text-green-400 flex-shrink-0" />}
                      {isDown && <TrendDownIcon size={14} className="text-red-400 flex-shrink-0" />}
                      {movementLabel && (
                        <span className={`text-xs font-medium ${isUp ? 'text-green-400' : isDown ? 'text-red-400' : 'text-sr-text-muted'}`}>{movementLabel}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {mv.type === 'newly_ranked' ? (
                      <div>
                        <span className="text-xs text-sr-text-muted mr-1">New score:</span>
                        <span className="text-sm font-bold text-white">{displayScoutRank(h.rank_score)}</span>
                      </div>
                    ) : mv.type === 'became_unranked' ? (
                      <div>
                        <span className="text-xs text-sr-text-muted mr-1">Previous:</span>
                        <span className="text-sm font-bold text-white">{displayScoutRank(h.previous_rank_score)}</span>
                        <span className="text-xs text-sr-text-muted mx-1.5">→</span>
                        <span className="text-sm font-bold text-sr-text-muted">Unranked</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {h.previous_rank_score != null && (
                          <>
                            <span className="text-xs text-sr-text-muted">{displayScoutRank(h.previous_rank_score)}</span>
                            <span className="text-xs text-sr-text-muted">→</span>
                          </>
                        )}
                        <span className="text-sm font-bold text-white">{displayScoutRank(h.rank_score)}</span>
                        {scoreDelta != null && scoreDelta !== 0 && (
                          <span className={`text-xs font-mono font-semibold ${scoreDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {scoreDelta > 0 ? '+' : ''}{scoreDelta.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                    {(h.leaderboard_position != null || h.previous_position != null) && (
                      <div className="flex items-center gap-1 text-xs text-sr-text-muted">
                        {h.previous_position != null && <span>#{h.previous_position}</span>}
                        {h.previous_position != null && h.leaderboard_position != null && <span>→</span>}
                        {h.leaderboard_position != null && <span className="text-sr-silver font-semibold">#{h.leaderboard_position}</span>}
                      </div>
                    )}
                    {mv.type === 'newly_ranked' && h.leaderboard_position != null && (
                      <span className="text-xs text-sr-text-muted">Entered at #{h.leaderboard_position}</span>
                    )}
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <button
                onClick={loadMore}
                className="w-full py-2.5 mt-2 rounded-xl border border-sr-border text-sm text-sr-text-muted hover:text-white hover:border-sr-border-light transition-colors">
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type SavedPostWithMedia = { post_id: string; posts: (Post & { profiles: Profile }) | null };

function SavedTab({ profileId }: { profileId: string }) {
  const [savedPosts, setSavedPosts] = useState<SavedPostWithMedia[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    supabase
      .from('saved_posts')
      .select('post_id, posts(*, profiles(*))')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error('Failed to load saved posts:', error.message);
        setSavedPosts((data as unknown as SavedPostWithMedia[] | null) ?? []);
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [profileId]);

  const handleUnsave = async (e: React.MouseEvent, postId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const { error } = await supabase
      .from('saved_posts')
      .delete()
      .eq('post_id', postId)
      .eq('profile_id', profileId);
    if (error) {
      console.error('Failed to unsave post:', error.message);
      return;
    }
    setSavedPosts(prev => prev.filter(s => s.post_id !== postId));
  };

  if (isLoading) {
    return <p className="text-sm text-sr-text-muted">Loading...</p>;
  }

  if (savedPosts.length === 0) {
    return (
      <div className="card-premium p-12 text-center">
        <Bookmark className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
        <h3 className="text-sm font-semibold text-white mb-1">Nothing saved yet</h3>
        <p className="text-xs text-sr-text-muted">Tap the bookmark icon on a post in Explore or Feed to save it here.</p>
      </div>
    );
  }

  // TikTok-style grid of covers — tap one to open it full-screen (same
  // viewer as Explore), tap the bookmark overlay to unsave without leaving
  // the grid.
  return (
    <div className="grid grid-cols-3 gap-1">
      {savedPosts.filter(s => s.posts).map(saved => {
        const post = saved.posts!;
        const isVideo = post.media_type === 'video';
        return (
          <Link
            key={saved.post_id}
            to={`/explore/${saved.post_id}`}
            className="relative aspect-[3/4] rounded-lg overflow-hidden bg-sr-surface group"
          >
            {post.media_type === 'photo' ? (
              <img src={post.media_url ?? ''} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            ) : isVideo ? (
              // #t=0.1 forces a cover frame to actually render on load —
              // without a time fragment, iOS Safari leaves the <video>
              // blank until playback starts (desktop Chrome auto-decodes
              // a frame so this looked fine there, but not on mobile).
              <video src={`${post.media_url ?? ''}#t=0.1`} className="absolute inset-0 w-full h-full object-cover" muted playsInline preload="metadata" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-sr-purple to-sr-blue" />
            )}
            {isVideo && (
              <div className="absolute bottom-1.5 left-1.5">
                <Play className="h-3.5 w-3.5 text-white fill-white drop-shadow" />
              </div>
            )}
            <button
              onClick={e => handleUnsave(e, saved.post_id)}
              className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove from saved"
            >
              <Bookmark className="h-3.5 w-3.5 text-sr-purple-light fill-sr-purple-light" />
            </button>
          </Link>
        );
      })}
    </div>
  );
}

