import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import type { Organisation, OrganisationPost, OrganisationStaff, Profile, ClubInvite, Team, TeamStaff, TeamPlayer } from '@/lib/supabase';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { SafeProfileLink } from '@/components/ui/SafeProfileLink';
import { Select } from '@/components/ui/Select';
import { formatSportName } from '@/utils/format';
import { SPORT_OPTIONS } from '@/lib/sports';
import {
  Building2, MapPin, Globe, Shield, Users,
  Trophy, Newspaper, ChevronRight, Loader2, AlertCircle,
  Settings, Pencil, Trash2, Send, X, Check, Share2, Upload, UserPlus, Plus, Search, UserCog,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

interface AffiliatedCoach extends Profile {
  role_title: string | null; // from the verification_submission
}

// ─── org type display ─────────────────────────────────────────────────────────

import { ORG_TYPE_LABEL } from '@/lib/locations';

// ─── page ─────────────────────────────────────────────────────────────────────

export default function OrganisationProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser, profile: viewerProfile } = useAuth();
  const [org, setOrg]           = useState<Organisation | null>(null);
  const [coaches, setCoaches]   = useState<AffiliatedCoach[]>([]);
  const [athletes, setAthletes] = useState<Profile[]>([]);
  const [myRequest, setMyRequest] = useState<{ id: string; status: string } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<{ id: string; profiles: Profile }[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [affiliationError, setAffiliationError] = useState('');
  const [activeTab, setActiveTab] = useState<'coaches' | 'athletes' | 'teams' | 'posts' | 'manage'>('coaches');
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ── Club's own staff roster, and this viewer's place in it (if any) ──
  // owned_organisation_id on a profile only ever points at the *owner's*
  // org, so it alone can't tell a non-owner staff member they're staff —
  // this is the actual source of truth for "does this viewer manage this
  // club at all, and as what."
  const [staff, setStaff] = useState<(OrganisationStaff & { profiles: Profile })[]>([]);
  const viewerStaffRow = staff.find(s => s.profile_id === viewerProfile?.id);
  const isOwner = viewerStaffRow?.role === 'owner';
  const isStaff = !!viewerStaffRow;
  const [removingStaffId, setRemovingStaffId] = useState<string | null>(null);
  const [staffError, setStaffError] = useState('');

  // ── Manage tab: editing the club's own public profile fields ──
  const [editForm, setEditForm] = useState({ name: '', bio: '', website: '', logo_url: '', banner_url: '' });
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaveError, setOrgSaveError] = useState('');
  const [orgSaved, setOrgSaved] = useState(false);

  // ── Club Posts tab ──
  const [posts, setPosts] = useState<(OrganisationPost & { profiles: Profile })[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [newPostContent, setNewPostContent] = useState('');
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [postError, setPostError] = useState('');

  // ── Share button — same copy-link pattern as AthleteProfilePage ──
  const [shareToast, setShareToast] = useState(false);
  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `${org?.name ?? 'This club'} on ScoutRank`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2500);
      });
    }
  };

  // ── Coach/scout invites — club-initiated, mirrors the athlete-initiated
  // club_affiliation_requests flow but in the other direction. Accepted
  // ones show up in the Coaches & Scouts tab alongside the existing
  // admin-verified list; that list's own query is untouched. ──
  const [invitedCoaches, setInvitedCoaches] = useState<(ClubInvite & { profiles: Profile })[]>([]);
  const [pendingCoachInvites, setPendingCoachInvites] = useState<(ClubInvite & { profiles: Profile })[]>([]);
  const [showCoachInvite, setShowCoachInvite] = useState(false);
  const [coachInviteQuery, setCoachInviteQuery] = useState('');
  const [coachInviteResults, setCoachInviteResults] = useState<Profile[]>([]);
  const [coachInviteSearching, setCoachInviteSearching] = useState(false);
  const [coachInviteSendingId, setCoachInviteSendingId] = useState<string | null>(null);
  const [coachInviteError, setCoachInviteError] = useState('');

  // ── Athlete invites — club-initiated version of "Request to Join"
  // above. Accepting sets the invitee's own affiliated_organisation_id,
  // same column the existing request flow sets — the Athletes list below
  // needs no query change to pick these up. ──
  const [pendingAthleteInvites, setPendingAthleteInvites] = useState<(ClubInvite & { profiles: Profile })[]>([]);
  const [showAthleteInvite, setShowAthleteInvite] = useState(false);
  const [athleteInviteQuery, setAthleteInviteQuery] = useState('');
  const [athleteInviteResults, setAthleteInviteResults] = useState<Profile[]>([]);
  const [athleteInviteSearching, setAthleteInviteSearching] = useState(false);
  const [athleteInviteSendingId, setAthleteInviteSendingId] = useState<string | null>(null);
  const [athleteInviteError, setAthleteInviteError] = useState('');

  useEffect(() => {
    if (!id) return;
    supabase.from('club_invites').select('*, profiles:invited_profile_id(*)')
      .eq('organisation_id', id).eq('role_context', 'coach_scout').eq('status', 'accepted')
      .then(({ data, error }) => {
        if (error) { console.error('[org-profile] accepted coach invites error:', error.message); return; }
        setInvitedCoaches((data as unknown as (ClubInvite & { profiles: Profile })[] | null) ?? []);
      });
  }, [id]);

  useEffect(() => {
    if (!id || !isStaff) { setPendingCoachInvites([]); setPendingAthleteInvites([]); return; }
    supabase.from('club_invites').select('*, profiles:invited_profile_id(*)')
      .eq('organisation_id', id).eq('status', 'pending')
      .then(({ data, error }) => {
        if (error) { console.error('[org-profile] pending invites error:', error.message); return; }
        const rows = (data as unknown as (ClubInvite & { profiles: Profile })[] | null) ?? [];
        setPendingCoachInvites(rows.filter(r => r.role_context === 'coach_scout'));
        setPendingAthleteInvites(rows.filter(r => r.role_context === 'athlete'));
      });
  }, [id, isStaff]);

  const searchCoachInvite = async (q: string) => {
    setCoachInviteQuery(q);
    setCoachInviteError('');
    if (q.trim().length < 2) { setCoachInviteResults([]); return; }
    setCoachInviteSearching(true);
    const { data, error } = await supabase.from('profiles').select('*')
      .in('role', ['coach', 'scout']).ilike('username', `%${q.trim()}%`).limit(6);
    setCoachInviteSearching(false);
    if (error) { console.error('[org-profile] coach search error:', error.message); return; }
    setCoachInviteResults((data as Profile[] | null) ?? []);
  };

  const sendCoachInvite = async (target: Profile) => {
    if (!id || !viewerProfile) return;
    setCoachInviteSendingId(target.id);
    setCoachInviteError('');
    const { data, error } = await supabase.from('club_invites').insert({
      organisation_id: id, invited_profile_id: target.id, invited_by: viewerProfile.id, role_context: 'coach_scout',
    }).select('*, profiles:invited_profile_id(*)').single();
    setCoachInviteSendingId(null);
    if (error) {
      setCoachInviteError(error.message.includes('duplicate') ? `${target.first_name} already has a pending invite from this club.` : error.message);
      return;
    }
    const invite = data as unknown as (ClubInvite & { profiles: Profile });
    await supabase.from('notifications').insert({
      recipient_id: target.id, actor_id: viewerProfile.id, type: 'club_coach_invite', target_type: 'club_invite', target_id: invite.id,
    });
    setPendingCoachInvites(prev => [invite, ...prev]);
    setCoachInviteQuery('');
    setCoachInviteResults([]);
  };

  const searchAthleteInvite = async (q: string) => {
    setAthleteInviteQuery(q);
    setAthleteInviteError('');
    if (q.trim().length < 2) { setAthleteInviteResults([]); return; }
    setAthleteInviteSearching(true);
    const { data, error } = await supabase.from('profiles').select('*')
      .eq('role', 'athlete').ilike('username', `%${q.trim()}%`).limit(6);
    setAthleteInviteSearching(false);
    if (error) { console.error('[org-profile] athlete search error:', error.message); return; }
    setAthleteInviteResults((data as Profile[] | null) ?? []);
  };

  const sendAthleteInvite = async (target: Profile) => {
    if (!id || !viewerProfile) return;
    setAthleteInviteSendingId(target.id);
    setAthleteInviteError('');
    const { data, error } = await supabase.from('club_invites').insert({
      organisation_id: id, invited_profile_id: target.id, invited_by: viewerProfile.id, role_context: 'athlete',
    }).select('*, profiles:invited_profile_id(*)').single();
    setAthleteInviteSendingId(null);
    if (error) {
      setAthleteInviteError(error.message.includes('duplicate') ? `${target.first_name} already has a pending invite from this club.` : error.message);
      return;
    }
    const invite = data as unknown as (ClubInvite & { profiles: Profile });
    await supabase.from('notifications').insert({
      recipient_id: target.id, actor_id: viewerProfile.id, type: 'club_athlete_invite', target_type: 'club_invite', target_id: invite.id,
    });
    setPendingAthleteInvites(prev => [invite, ...prev]);
    setAthleteInviteQuery('');
    setAthleteInviteResults([]);
  };

  const cancelInvite = async (inviteId: string, kind: 'coach' | 'athlete') => {
    const { error } = await supabase.from('club_invites').delete().eq('id', inviteId);
    if (error) {
      (kind === 'coach' ? setCoachInviteError : setAthleteInviteError)(error.message);
      return;
    }
    if (kind === 'coach') setPendingCoachInvites(prev => prev.filter(i => i.id !== inviteId));
    else setPendingAthleteInvites(prev => prev.filter(i => i.id !== inviteId));
  };

  // ── Teams — coaches/scouts get linked as a team's coaching staff,
  // athletes get added as its players. Anyone can view a club's teams;
  // only this org's own staff can create teams or edit their rosters. ──
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamStaff, setTeamStaff] = useState<(TeamStaff & { profiles: Profile })[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<(TeamPlayer & { profiles: Profile })[]>([]);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamSport, setNewTeamSport] = useState('');
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [addStaffSelect, setAddStaffSelect] = useState<Record<string, string>>({});
  const [addPlayerSelect, setAddPlayerSelect] = useState<Record<string, string>>({});
  const [teamActionPending, setTeamActionPending] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('teams').select('*').eq('organisation_id', id).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('[org-profile] teams error:', error.message); return; }
        setTeams((data as Team[] | null) ?? []);
      });
  }, [id]);

  useEffect(() => {
    if (teams.length === 0) { setTeamStaff([]); setTeamPlayers([]); return; }
    const teamIds = teams.map(t => t.id);
    supabase.from('team_staff').select('*, profiles:profile_id(*)').in('team_id', teamIds)
      .then(({ data, error }) => {
        if (error) { console.error('[org-profile] team staff error:', error.message); return; }
        setTeamStaff((data as unknown as (TeamStaff & { profiles: Profile })[] | null) ?? []);
      });
    supabase.from('team_players').select('*, profiles:profile_id(*)').in('team_id', teamIds)
      .then(({ data, error }) => {
        if (error) { console.error('[org-profile] team players error:', error.message); return; }
        setTeamPlayers((data as unknown as (TeamPlayer & { profiles: Profile })[] | null) ?? []);
      });
  }, [teams.length]);

  const createTeam = async () => {
    if (!id || !newTeamName.trim()) return;
    setCreatingTeam(true);
    setTeamError('');
    const { data, error } = await supabase.from('teams').insert({
      organisation_id: id, name: newTeamName.trim(), sport: newTeamSport || null, age_group: newTeamAgeGroup.trim() || null,
    }).select('*').single();
    setCreatingTeam(false);
    if (error) { setTeamError(error.message); return; }
    setTeams(prev => [...prev, data as Team]);
    setNewTeamName(''); setNewTeamSport(''); setNewTeamAgeGroup(''); setShowCreateTeam(false);
  };

  const deleteTeam = async (teamId: string) => {
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) { setTeamError(error.message); return; }
    setTeams(prev => prev.filter(t => t.id !== teamId));
  };

  const addTeamStaff = async (teamId: string) => {
    const profileId = addStaffSelect[teamId];
    if (!profileId) return;
    setTeamActionPending(`add-staff-${teamId}`);
    const { data, error } = await supabase.from('team_staff').insert({ team_id: teamId, profile_id: profileId })
      .select('*, profiles:profile_id(*)').single();
    setTeamActionPending(null);
    if (error) { setTeamError(error.message); return; }
    setTeamStaff(prev => [...prev, data as unknown as (TeamStaff & { profiles: Profile })]);
    setAddStaffSelect(prev => ({ ...prev, [teamId]: '' }));
  };

  const removeTeamStaff = async (rowId: string) => {
    setTeamActionPending(rowId);
    const { error } = await supabase.from('team_staff').delete().eq('id', rowId);
    setTeamActionPending(null);
    if (error) { setTeamError(error.message); return; }
    setTeamStaff(prev => prev.filter(r => r.id !== rowId));
  };

  const addTeamPlayer = async (teamId: string) => {
    const profileId = addPlayerSelect[teamId];
    if (!profileId) return;
    setTeamActionPending(`add-player-${teamId}`);
    const { data, error } = await supabase.from('team_players').insert({ team_id: teamId, profile_id: profileId })
      .select('*, profiles:profile_id(*)').single();
    setTeamActionPending(null);
    if (error) { setTeamError(error.message); return; }
    setTeamPlayers(prev => [...prev, data as unknown as (TeamPlayer & { profiles: Profile })]);
    setAddPlayerSelect(prev => ({ ...prev, [teamId]: '' }));
  };

  const removeTeamPlayer = async (rowId: string) => {
    setTeamActionPending(rowId);
    const { error } = await supabase.from('team_players').delete().eq('id', rowId);
    setTeamActionPending(null);
    if (error) { setTeamError(error.message); return; }
    setTeamPlayers(prev => prev.filter(r => r.id !== rowId));
  };

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);

    // 1. Load the organisation.
    supabase
      .from('organisations')
      .select('*')
      .eq('id', id)
      .single()
      .then(async ({ data: orgData, error: orgError }) => {
        if (orgError || !orgData) { setNotFound(true); setIsLoading(false); return; }
        setOrg(orgData as Organisation);
        const o = orgData as Organisation;
        setEditForm({ name: o.name ?? '', bio: o.bio ?? '', website: o.website ?? '', logo_url: o.logo_url ?? '', banner_url: o.banner_url ?? '' });

        // 2. Load verified coaches/scouts affiliated via verification_submissions.
        // verification_submissions.organisation_id links a coach's approved
        // verification to a specific org. We only show verified accounts.
        const { data: subData, error: subError } = await supabase
          .from('verification_submissions')
          .select('profile_id, role_title, status')
          .eq('organisation_id', id)
          .eq('status', 'approved');

        if (subError) { console.error('[org-profile] submissions error:', subError.message); setIsLoading(false); return; }

        const profileIds = [...new Set((subData ?? []).map((s: { profile_id: string }) => s.profile_id))];
        const roleByProfile: Record<string, string> = {};
        for (const s of (subData ?? []) as { profile_id: string; role_title: string }[]) {
          roleByProfile[s.profile_id] = s.role_title;
        }

        if (profileIds.length > 0) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', profileIds)
            .eq('coach_scout_verification_status', 'verified');

          if (profileError) { console.error('[org-profile] profiles error:', profileError.message); }

          const affiliated: AffiliatedCoach[] = ((profileData as Profile[] | null) ?? []).map(p => ({
            ...p,
            role_title: roleByProfile[p.id] ?? null,
          }));
          setCoaches(affiliated);
        }

        setIsLoading(false);
      });
  }, [id]);

  // Athlete affiliation — approved athletes list, the viewer's own
  // request (if they're an athlete who's requested/joined), and pending
  // requests to review (if the viewer is one of this org's own
  // approved coaches/scouts).
  const isCoachHere = coaches.some(c => c.id === viewerProfile?.id);
  useEffect(() => {
    if (!id) return;
    supabase.from('profiles').select('*').eq('affiliated_organisation_id', id)
      .then(({ data }) => setAthletes((data as Profile[] | null) ?? []));

    if (viewerProfile?.role === 'athlete') {
      supabase.from('club_affiliation_requests').select('id, status').eq('organisation_id', id).eq('profile_id', viewerProfile.id).maybeSingle()
        .then(({ data }) => setMyRequest(data as { id: string; status: string } | null));
    }
  }, [id, viewerProfile?.id]);

  useEffect(() => {
    if (!id || !isCoachHere) return;
    supabase.from('club_affiliation_requests').select('id, profiles:profile_id(*)').eq('organisation_id', id).eq('status', 'pending')
      .then(({ data }) => setPendingRequests((data as unknown as { id: string; profiles: Profile }[] | null) ?? []));
  }, [id, isCoachHere]);

  const requestToJoin = async () => {
    if (!id || !viewerProfile) return;
    setRequesting(true);
    setAffiliationError('');
    const { data, error } = await supabase.from('club_affiliation_requests').insert({ organisation_id: id, profile_id: viewerProfile.id }).select('id, status').single();
    setRequesting(false);
    if (error) { setAffiliationError(error.message); return; }
    setMyRequest(data as { id: string; status: string });
  };

  const reviewRequest = async (requestId: string, action: 'approve' | 'reject') => {
    setReviewingId(requestId);
    setAffiliationError('');
    const { data, error } = await supabase.functions.invoke('review-club-affiliation', { body: { requestId, action } });
    setReviewingId(null);
    if (error || data?.error) { setAffiliationError(data?.error ?? error?.message ?? 'Failed to review request.'); return; }
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    if (action === 'approve') {
      const approved = pendingRequests.find(r => r.id === requestId);
      if (approved) setAthletes(prev => [...prev, approved.profiles]);
    }
  };

  // Staff roster — every signed-in visitor can fetch this (it's small
  // and just names/roles), which is what lets us compute isOwner/isStaff
  // above for a viewer who's staff but not the owner.
  useEffect(() => {
    if (!id) return;
    supabase.from('organisation_staff').select('*, profiles:profile_id(*)').eq('organisation_id', id)
      .then(({ data, error }) => {
        if (error) { console.error('[org-profile] staff error:', error.message); return; }
        setStaff((data as unknown as (OrganisationStaff & { profiles: Profile })[] | null) ?? []);
      });
  }, [id]);

  const removeStaff = async (staffId: string) => {
    setRemovingStaffId(staffId);
    setStaffError('');
    const { error } = await supabase.from('organisation_staff').delete().eq('id', staffId);
    setRemovingStaffId(null);
    if (error) { setStaffError(error.message); return; }
    setStaff(prev => prev.filter(s => s.id !== staffId));
  };

  const saveOrgDetails = async () => {
    if (!id) return;
    setSavingOrg(true);
    setOrgSaveError('');
    setOrgSaved(false);
    const { data, error } = await supabase.from('organisations').update({
      name: editForm.name.trim(),
      bio: editForm.bio.trim() || null,
      website: editForm.website.trim() || null,
      logo_url: editForm.logo_url.trim() || null,
      banner_url: editForm.banner_url.trim() || null,
    }).eq('id', id).select('*').single();
    setSavingOrg(false);
    if (error) { setOrgSaveError(error.message); return; }
    setOrg(data as Organisation);
    setOrgSaved(true);
    setTimeout(() => setOrgSaved(false), 2500);
  };

  // Club Posts — public read, same as everything else on this page.
  useEffect(() => {
    if (!id) return;
    setPostsLoading(true);
    supabase.from('organisation_posts').select('*, profiles:author_profile_id(*)').eq('organisation_id', id).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        setPostsLoading(false);
        if (error) { console.error('[org-profile] posts error:', error.message); return; }
        setPosts((data as unknown as (OrganisationPost & { profiles: Profile })[] | null) ?? []);
      });
  }, [id]);

  const postUpdate = async () => {
    if (!id || !viewerProfile || !newPostContent.trim()) return;
    setPostingUpdate(true);
    setPostError('');
    const { data, error } = await supabase.from('organisation_posts')
      .insert({ organisation_id: id, author_profile_id: viewerProfile.id, content: newPostContent.trim() })
      .select('*, profiles:author_profile_id(*)').single();
    setPostingUpdate(false);
    if (error) { setPostError(error.message); return; }
    setPosts(prev => [data as unknown as (OrganisationPost & { profiles: Profile }), ...prev]);
    setNewPostContent('');
  };

  const deletePost = async (postId: string) => {
    const { error } = await supabase.from('organisation_posts').delete().eq('id', postId);
    if (error) { setPostError(error.message); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 text-sr-purple animate-spin" />
    </div>
  );

  if (notFound || !org) return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <AlertCircle className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
      <h1 className="text-xl font-bold text-white mb-2">Organisation Not Found</h1>
      <p className="text-sr-text-muted">This organisation doesn't exist or has been removed.</p>
    </div>
  );

  // Combined Coaches & Scouts roster — the existing admin-verified list
  // plus anyone who's accepted a club invite (deduped, in case someone is
  // both). The verified list's own criteria/query is unchanged; this just
  // adds a second source into what the tab displays.
  const coachRoster: { profile: Profile; roleTitle: string | null; verified: boolean }[] = [
    ...coaches.map(c => ({ profile: c as Profile, roleTitle: c.role_title, verified: true })),
    ...invitedCoaches
      .filter(inv => !coaches.some(c => c.id === inv.invited_profile_id))
      .map(inv => ({ profile: inv.profiles, roleTitle: null, verified: inv.profiles.coach_scout_verification_status === 'verified' })),
  ];

  const TABS = [
    { id: 'coaches' as const, label: 'Coaches & Scouts', icon: Shield, count: coachRoster.length },
    { id: 'athletes' as const, label: 'Athletes', icon: Users, count: null },
    { id: 'teams' as const, label: 'Teams', icon: Trophy, count: null },
    { id: 'posts' as const, label: 'Posts', icon: Newspaper, count: posts.length },
    // Only this org's own staff ever see this tab at all — everyone else
    // gets exactly the public club page they had before.
    ...(isStaff ? [{ id: 'manage' as const, label: 'Manage', icon: Settings, count: null }] : []),
  ];

  return (
    <div className="min-h-screen">
      {/* Banner */}
      <div className="h-48 sm:h-64 relative overflow-hidden">
        {org.banner_url ? (
          <img src={org.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          // Gradient fallback — same pattern as AthleteProfilePage's fallback,
          // shown until this club's owner sets a real banner in Manage.
          <div className="absolute inset-0 bg-gradient-to-br from-sr-surface to-sr-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-sr-bg via-transparent to-transparent" />
        {!org.banner_url && (
          <>
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_50%,rgba(138,63,252,0.4),transparent_55%)]" />
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_70%_30%,rgba(59,130,246,0.3),transparent_50%)]" />
          </>
        )}
      </div>

      {/* Header */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="relative -mt-20 sm:-mt-24 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            {/* Org logo / placeholder */}
            <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-2xl border-4 border-sr-bg shadow-xl glow-brand flex-shrink-0 overflow-hidden bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center">
              {org.logo_url ? (
                <img src={org.logo_url} alt={org.name} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-14 w-14 sm:h-18 sm:w-18 text-white/90" />
              )}
            </div>

            <div className="flex-1 pb-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">{org.name}</h1>
                  {org.verified && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-sr-purple/20 to-sr-blue/20 border border-sr-purple/30 text-white">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center flex-shrink-0">
                        <Shield className="h-2 w-2 text-white" strokeWidth={3} />
                      </div>
                      Verified Organisation
                    </span>
                  )}
                  {isStaff && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-sr-surface border border-sr-border text-sr-text-muted">
                      {isOwner ? 'Your Club' : 'You Manage This Club'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-sr-text-muted mt-0.5">{ORG_TYPE_LABEL[org.type] ?? org.type}</p>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-sr-text-muted">
                  {(org.city || org.state || org.country) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {[org.city, org.state, org.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {org.website && (
                    <a href={org.website} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sr-purple-light hover:text-sr-purple transition-colors">
                      <Globe className="h-3.5 w-3.5" />
                      {org.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>

                {/* Counts — same idea as a profile's follower/following row */}
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-white font-semibold">{coaches.length}</span>{' '}
                  <span className="text-sr-text-muted -ml-3">Coaches &amp; Scouts</span>
                  <span className="text-white font-semibold">{athletes.length}</span>{' '}
                  <span className="text-sr-text-muted -ml-3">Athletes</span>
                </div>
              </div>

              {/* Actions — mirrors AthleteProfilePage's owner action row */}
              <div className="flex items-center gap-2 flex-wrap relative">
                {isStaff && (
                  <button onClick={() => setActiveTab('manage')}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30 transition-colors">
                    <Settings className="h-4 w-4" /> Manage
                  </button>
                )}
                {/* Account settings — every account type gets this. Non-owners
                    reach it from their own personal profile page (Edit
                    Profile → /settings), but this club's owner account has
                    no personal profile page anymore (it redirects straight
                    here), so it needs its own way in. */}
                {isOwner && (
                  <button onClick={() => navigate('/settings')}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30 transition-colors">
                    <UserCog className="h-4 w-4" /> Account Settings
                  </button>
                )}
                <button onClick={handleShare}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 transition-colors">
                  <Share2 className="h-4 w-4" /> Share
                </button>
                {shareToast && (
                  <span className="absolute top-full right-0 mt-2 text-xs px-2.5 py-1 rounded-lg bg-sr-surface border border-sr-border text-sr-silver whitespace-nowrap">
                    Link copied!
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sports tags */}
        {org.sports.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {org.sports.map(s => (
              <span key={s} className="px-3 py-1 rounded-full text-xs font-medium bg-sr-surface border border-sr-border text-sr-silver">
                {formatSportName(s)}
              </span>
            ))}
          </div>
        )}

        {/* Quick post — staff-only, posts as the club. Lives up here
            (rather than tucked inside the Posts tab) so posting is
            immediately visible, same as the composer on a personal
            profile's Overview tab. The Posts tab below still lists
            everything that's been shared, including these. */}
        {isStaff && (
          <div className="card-premium p-4 bg-sr-surface flex gap-3 items-start mb-6">
            <div className="h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center">
              {org.logo_url ? <img src={org.logo_url} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5 text-white" />}
            </div>
            <div className="flex-1 flex flex-col items-end">
              {postError && (
                <p className="w-full text-red-400 text-xs mb-1">{postError}</p>
              )}
              <textarea
                className="w-full bg-transparent border-none outline-none resize-none text-sm text-white placeholder:text-sr-text-muted min-h-[40px] pt-2"
                placeholder={`Share an update as ${org.name}...`}
                value={newPostContent}
                onChange={e => setNewPostContent(e.target.value)}
              />
              <div className="flex justify-between items-center w-full mt-2 border-t border-sr-border/50 pt-2">
                <div className="flex gap-2">
                  <button className="p-2 text-sr-text-muted hover:text-sr-purple-light transition-colors rounded-full hover:bg-sr-purple/10"><Upload className="h-4 w-4" /></button>
                </div>
                <button onClick={postUpdate} disabled={postingUpdate || !newPostContent.trim()}
                  className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-full bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                  {postingUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {postingUpdate ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab bar — matches AthleteProfilePage pattern */}
        <div className="flex gap-0 overflow-x-auto mb-6 border-b border-sr-border">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all -mb-px ${
                activeTab === tab.id
                  ? 'border-sr-purple text-white'
                  : 'border-transparent text-sr-text-muted hover:text-sr-silver'
              }`}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="text-xs bg-sr-surface border border-sr-border px-1.5 py-0.5 rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="pb-16">
          {activeTab === 'coaches' && (
            <div className="space-y-4">
              {isStaff && (
                <div className="card-premium p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Invite a Coach or Scout</p>
                    <button onClick={() => setShowCoachInvite(s => !s)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
                      <UserPlus className="h-3.5 w-3.5" /> {showCoachInvite ? 'Close' : 'Invite'}
                    </button>
                  </div>
                  {showCoachInvite && (
                    <div className="mt-3">
                      {coachInviteError && <p className="text-xs text-red-400 mb-2">{coachInviteError}</p>}
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 text-sr-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        <input value={coachInviteQuery} onChange={e => searchCoachInvite(e.target.value)}
                          placeholder="Search by username..."
                          className="w-full bg-sr-surface border border-sr-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-sr-text-muted focus:outline-none focus:border-sr-purple/50" />
                      </div>
                      {coachInviteSearching && <p className="text-xs text-sr-text-muted mt-2">Searching...</p>}
                      {coachInviteResults.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {coachInviteResults.map(r => (
                            <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-sr-surface border border-sr-border">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-7 w-7 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-[10px] font-bold">
                                  {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" /> : `${r.first_name?.[0]}${r.last_name?.[0]}`}
                                </div>
                                <p className="text-xs text-white truncate">{fullName(r)} <span className="text-sr-text-muted">@{r.username}</span></p>
                              </div>
                              <button onClick={() => sendCoachInvite(r)} disabled={coachInviteSendingId === r.id}
                                className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                                {coachInviteSendingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Invite'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {pendingCoachInvites.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-sr-border space-y-1.5">
                      <p className="text-xs text-sr-text-muted mb-1">Pending invites</p>
                      {pendingCoachInvites.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-sr-surface border border-sr-border">
                          <p className="text-xs text-sr-silver truncate">{fullName(inv.profiles)} <span className="text-sr-text-muted">@{inv.profiles.username}</span></p>
                          <button onClick={() => cancelInvite(inv.id, 'coach')} title="Cancel invite" className="flex-shrink-0 text-sr-text-muted hover:text-red-400">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {coachRoster.length === 0 ? (
                <div className="card-premium p-12 text-center">
                  <Shield className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
                  <p className="text-white font-semibold mb-1">No Verified Coaches Yet</p>
                  <p className="text-sm text-sr-text-muted">
                    Verified coaches and scouts who listed this organisation will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {coachRoster.map(({ profile: coach, roleTitle }) => (
                    <SafeProfileLink
                      key={coach.id}
                      targetProfile={coach}
                      viewerProfile={viewerProfile}
                      viewerUserId={currentUser?.id}
                      className="card-premium p-5 hover:border-sr-purple/30 transition-colors group block"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        {/* Avatar */}
                        <div className="h-12 w-12 rounded-xl overflow-hidden flex-shrink-0">
                          {coach.avatar_url ? (
                            <img src={coach.avatar_url} alt={fullName(coach)} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-sm font-bold">
                              {coach.first_name?.[0]}{coach.last_name?.[0]}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-sr-purple-light transition-colors">
                            {fullName(coach)}
                          </p>
                          <p className="text-xs text-sr-text-muted truncate">
                            {roleTitle ?? (coach.role === 'coach' ? 'Coach' : 'Scout')}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-sr-text-muted group-hover:text-sr-purple-light transition-colors flex-shrink-0" />
                      </div>
                      <VerificationBadge status={coach.coach_scout_verification_status} role={coach.role} size="sm" />
                    </SafeProfileLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'athletes' && (
            <div className="space-y-6">
              {affiliationError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{affiliationError}
                </div>
              )}

              {isStaff && (
                <div className="card-premium p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Invite a Player</p>
                    <button onClick={() => setShowAthleteInvite(s => !s)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
                      <UserPlus className="h-3.5 w-3.5" /> {showAthleteInvite ? 'Close' : 'Invite'}
                    </button>
                  </div>
                  {showAthleteInvite && (
                    <div className="mt-3">
                      {athleteInviteError && <p className="text-xs text-red-400 mb-2">{athleteInviteError}</p>}
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 text-sr-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        <input value={athleteInviteQuery} onChange={e => searchAthleteInvite(e.target.value)}
                          placeholder="Search by username..."
                          className="w-full bg-sr-surface border border-sr-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-sr-text-muted focus:outline-none focus:border-sr-purple/50" />
                      </div>
                      {athleteInviteSearching && <p className="text-xs text-sr-text-muted mt-2">Searching...</p>}
                      {athleteInviteResults.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {athleteInviteResults.map(r => (
                            <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-sr-surface border border-sr-border">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-7 w-7 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-[10px] font-bold">
                                  {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" /> : `${r.first_name?.[0]}${r.last_name?.[0]}`}
                                </div>
                                <p className="text-xs text-white truncate">{fullName(r)} <span className="text-sr-text-muted">@{r.username}</span></p>
                              </div>
                              <button onClick={() => sendAthleteInvite(r)} disabled={athleteInviteSendingId === r.id}
                                className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                                {athleteInviteSendingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Invite'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {pendingAthleteInvites.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-sr-border space-y-1.5">
                      <p className="text-xs text-sr-text-muted mb-1">Pending invites</p>
                      {pendingAthleteInvites.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-sr-surface border border-sr-border">
                          <p className="text-xs text-sr-silver truncate">{fullName(inv.profiles)} <span className="text-sr-text-muted">@{inv.profiles.username}</span></p>
                          <button onClick={() => cancelInvite(inv.id, 'athlete')} title="Cancel invite" className="flex-shrink-0 text-sr-text-muted hover:text-red-400">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Join button/status — athlete viewers only */}
              {viewerProfile?.role === 'athlete' && (
                <div className="card-premium p-4">
                  {myRequest?.status === 'approved' ? (
                    <div className="flex items-center gap-2 text-sm text-green-400 font-semibold">
                      <Shield className="h-4 w-4" /> You're a verified member of this club
                    </div>
                  ) : myRequest?.status === 'pending' ? (
                    <p className="text-sm text-yellow-400">Your request to join is pending review.</p>
                  ) : myRequest?.status === 'rejected' ? (
                    <p className="text-sm text-sr-text-muted">Your request to join was not approved.</p>
                  ) : (
                    <button onClick={requestToJoin} disabled={requesting}
                      className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                      {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Request to Join {org?.name}
                    </button>
                  )}
                </div>
              )}

              {/* Pending requests — visible only to this org's own approved coaches/scouts */}
              {isCoachHere && pendingRequests.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-white mb-3">Pending Join Requests ({pendingRequests.length})</p>
                  <div className="space-y-2">
                    {pendingRequests.map(r => (
                      <div key={r.id} className="card-premium p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xs font-bold">
                            {r.profiles.avatar_url ? <img src={r.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : `${r.profiles.first_name?.[0]}${r.profiles.last_name?.[0]}`}
                          </div>
                          <p className="text-sm text-white truncate">{fullName(r.profiles)}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => reviewRequest(r.id, 'approve')} disabled={reviewingId === r.id}
                            className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50">Approve</button>
                          <button onClick={() => reviewRequest(r.id, 'reject')} disabled={reviewingId === r.id}
                            className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-red-500/30 hover:text-red-400 disabled:opacity-50">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approved athletes */}
              {athletes.length === 0 ? (
                <div className="card-premium p-12 text-center">
                  <Users className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
                  <p className="text-white font-semibold mb-1">No Athletes Yet</p>
                  <p className="text-sm text-sr-text-muted">Athletes affiliated with this organisation will appear here.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {athletes.map(a => (
                    <SafeProfileLink key={a.id} targetProfile={a} viewerProfile={viewerProfile} viewerUserId={currentUser?.id}
                      className="card-premium p-4 hover:border-sr-purple/30 transition-colors group flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl overflow-hidden flex-shrink-0">
                        {a.avatar_url ? <img src={a.avatar_url} alt="" className="h-full w-full object-cover" /> : (
                          <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-sm font-bold">
                            {a.first_name?.[0]}{a.last_name?.[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-sr-purple-light transition-colors">{fullName(a)}</p>
                        <p className="text-xs text-sr-text-muted truncate">
                          {formatSportName(a.sport)}{a.age_group ? ` · ${a.age_group}` : ''}
                        </p>
                      </div>
                    </SafeProfileLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'teams' && (
            <div className="space-y-4">
              {teamError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{teamError}
                </div>
              )}

              {isStaff && (
                <div className="card-premium p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Teams</p>
                    <button onClick={() => setShowCreateTeam(s => !s)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
                      <Plus className="h-3.5 w-3.5" /> {showCreateTeam ? 'Close' : 'Create Team'}
                    </button>
                  </div>
                  {showCreateTeam && (
                    <div className="mt-3 space-y-2.5">
                      <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Team name — e.g. Under 15s"
                        className="w-full bg-sr-surface border border-sr-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-sr-text-muted focus:outline-none focus:border-sr-purple/50" />
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        <Select value={newTeamSport} onChange={setNewTeamSport}
                          options={[{ value: '', label: 'Sport (optional)' }, ...SPORT_OPTIONS]} />
                        <input value={newTeamAgeGroup} onChange={e => setNewTeamAgeGroup(e.target.value)} placeholder="Age group (optional) — e.g. U15"
                          className="w-full bg-sr-surface border border-sr-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-sr-text-muted focus:outline-none focus:border-sr-purple/50" />
                      </div>
                      <button onClick={createTeam} disabled={creatingTeam || !newTeamName.trim()}
                        className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                        {creatingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create Team
                      </button>
                    </div>
                  )}
                </div>
              )}

              {teams.length === 0 ? (
                <div className="card-premium p-12 text-center">
                  <Trophy className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
                  <p className="text-white font-semibold mb-1">No Teams Yet</p>
                  <p className="text-sm text-sr-text-muted">
                    {isStaff ? 'Create your first team above.' : 'Teams and squads associated with this organisation will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="grid lg:grid-cols-2 gap-4">
                  {teams.map(team => {
                    const staffOnTeam = teamStaff.filter(s => s.team_id === team.id);
                    const playersOnTeam = teamPlayers.filter(p => p.team_id === team.id);
                    const availableCoaches = coachRoster
                      .map(c => c.profile)
                      .filter(c => !staffOnTeam.some(s => s.profile_id === c.id));
                    const availablePlayers = athletes.filter(a => !playersOnTeam.some(p => p.profile_id === a.id));

                    return (
                      <div key={team.id} className="card-premium p-5">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{team.name}</p>
                            <p className="text-xs text-sr-text-muted mt-0.5">
                              {[team.sport ? formatSportName(team.sport) : null, team.age_group].filter(Boolean).join(' · ') || 'No sport or age group set'}
                            </p>
                          </div>
                          {isStaff && (
                            <button onClick={() => deleteTeam(team.id)} title="Delete team"
                              className="flex-shrink-0 text-sr-text-muted hover:text-red-400 transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        {/* Coaching staff */}
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-sr-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5" /> Coaching Staff
                          </p>
                          {staffOnTeam.length === 0 ? (
                            <p className="text-xs text-sr-text-muted">No coaches or scouts linked yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {staffOnTeam.map(s => (
                                <div key={s.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-sr-surface border border-sr-border">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="h-6 w-6 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-[9px] font-bold">
                                      {s.profiles.avatar_url ? <img src={s.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : `${s.profiles.first_name?.[0]}${s.profiles.last_name?.[0]}`}
                                    </div>
                                    <p className="text-xs text-sr-silver truncate">{fullName(s.profiles)}</p>
                                  </div>
                                  {isStaff && (
                                    <button onClick={() => removeTeamStaff(s.id)} disabled={teamActionPending === s.id} className="flex-shrink-0 text-sr-text-muted hover:text-red-400 disabled:opacity-50">
                                      {teamActionPending === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {isStaff && availableCoaches.length > 0 && (
                            <div className="flex gap-1.5 mt-2">
                              <select value={addStaffSelect[team.id] ?? ''} onChange={e => setAddStaffSelect(prev => ({ ...prev, [team.id]: e.target.value }))}
                                className="flex-1 bg-sr-surface border border-sr-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sr-purple/50">
                                <option value="">Add coach/scout...</option>
                                {availableCoaches.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                              </select>
                              <button onClick={() => addTeamStaff(team.id)} disabled={!addStaffSelect[team.id] || teamActionPending === `add-staff-${team.id}`}
                                className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                                {teamActionPending === `add-staff-${team.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Players */}
                        <div>
                          <p className="text-xs font-semibold text-sr-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" /> Players
                          </p>
                          {playersOnTeam.length === 0 ? (
                            <p className="text-xs text-sr-text-muted">No players added yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {playersOnTeam.map(p => (
                                <div key={p.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-sr-surface border border-sr-border">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="h-6 w-6 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-[9px] font-bold">
                                      {p.profiles.avatar_url ? <img src={p.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : `${p.profiles.first_name?.[0]}${p.profiles.last_name?.[0]}`}
                                    </div>
                                    <p className="text-xs text-sr-silver truncate">{fullName(p.profiles)}</p>
                                  </div>
                                  {isStaff && (
                                    <button onClick={() => removeTeamPlayer(p.id)} disabled={teamActionPending === p.id} className="flex-shrink-0 text-sr-text-muted hover:text-red-400 disabled:opacity-50">
                                      {teamActionPending === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {isStaff && availablePlayers.length > 0 && (
                            <div className="flex gap-1.5 mt-2">
                              <select value={addPlayerSelect[team.id] ?? ''} onChange={e => setAddPlayerSelect(prev => ({ ...prev, [team.id]: e.target.value }))}
                                className="flex-1 bg-sr-surface border border-sr-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sr-purple/50">
                                <option value="">Add player...</option>
                                {availablePlayers.map(a => <option key={a.id} value={a.id}>{fullName(a)}</option>)}
                              </select>
                              <button onClick={() => addTeamPlayer(team.id)} disabled={!addPlayerSelect[team.id] || teamActionPending === `add-player-${team.id}`}
                                className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                                {teamActionPending === `add-player-${team.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'posts' && (
            <div className="space-y-4">
              {/* Posting itself now happens in the composer up top (visible
                  on every tab) — this tab is just the running list of
                  everything that's been shared, including those posts. */}
              {postError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{postError}
                </div>
              )}

              {postsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-sr-purple animate-spin" />
                </div>
              ) : posts.length === 0 ? (
                <div className="card-premium p-12 text-center">
                  <Newspaper className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
                  <p className="text-white font-semibold mb-1">No Posts Yet</p>
                  <p className="text-sm text-sr-text-muted">News and updates from this organisation will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {posts.map(post => (
                    <div key={post.id} className="card-premium p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-9 w-9 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xs font-bold">
                            {org.logo_url ? <img src={org.logo_url} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{org.name}</p>
                            <p className="text-xs text-sr-text-muted truncate">Posted by {fullName(post.profiles)} · {new Date(post.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        {isStaff && (
                          <button onClick={() => deletePost(post.id)} title="Delete post"
                            className="flex-shrink-0 text-sr-text-muted hover:text-red-400 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-sr-silver mt-3 whitespace-pre-wrap">{post.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'manage' && isStaff && (
            <div className="space-y-6 max-w-2xl">
              {/* Edit basic club details — deliberately just the low-risk,
                  purely presentational fields (name/bio/website/images).
                  Sport, location and type stay admin-controlled for now
                  since they factor into verification and search — not
                  something to hand to self-serve editing yet. */}
              <div className="card-premium p-5">
                <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Pencil className="h-4 w-4" /> Club Profile</h2>
                {orgSaveError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{orgSaveError}</div>
                )}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-sr-text-muted mb-1">Club Name</label>
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-sr-surface border border-sr-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sr-purple/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-sr-text-muted mb-1">Bio</label>
                    <textarea value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={3}
                      placeholder="Tell athletes and scouts about this club..."
                      className="w-full bg-sr-surface border border-sr-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-sr-text-muted resize-none focus:outline-none focus:border-sr-purple/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-sr-text-muted mb-1">Website</label>
                    <input value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} placeholder="https://"
                      className="w-full bg-sr-surface border border-sr-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-sr-text-muted focus:outline-none focus:border-sr-purple/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-sr-text-muted mb-1">Logo image URL</label>
                    <input value={editForm.logo_url} onChange={e => setEditForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://..."
                      className="w-full bg-sr-surface border border-sr-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-sr-text-muted focus:outline-none focus:border-sr-purple/50" />
                    <p className="text-[11px] text-sr-text-muted mt-1">Paste a link to an image for now — direct upload is a good next addition here.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-sr-text-muted mb-1">Banner image URL</label>
                    <input value={editForm.banner_url} onChange={e => setEditForm(f => ({ ...f, banner_url: e.target.value }))} placeholder="https://..."
                      className="w-full bg-sr-surface border border-sr-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-sr-text-muted focus:outline-none focus:border-sr-purple/50" />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button onClick={saveOrgDetails} disabled={savingOrg || !editForm.name.trim()}
                      className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                      {savingOrg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save Changes
                    </button>
                    {orgSaved && <span className="text-xs text-green-400">Saved</span>}
                  </div>
                </div>
              </div>

              {/* Staff roster — view for any staff, remove for the owner
                  only. There's no self-serve "invite a teammate" flow yet
                  (that needs its own invite/accept mechanism, same shape
                  as the athlete join-request flow above) — for now, add
                  additional staff the same way the first owner was added:
                  an admin-side action. This is the natural next step here. */}
              <div className="card-premium p-5">
                <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Users className="h-4 w-4" /> Club Staff</h2>
                {staffError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{staffError}</div>
                )}
                <div className="space-y-2">
                  {staff.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-sr-surface border border-sr-border">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xs font-bold">
                          {s.profiles.avatar_url ? <img src={s.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : `${s.profiles.first_name?.[0]}${s.profiles.last_name?.[0]}`}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{fullName(s.profiles)}</p>
                          <p className="text-xs text-sr-text-muted capitalize">{s.role}</p>
                        </div>
                      </div>
                      {isOwner && s.role !== 'owner' && (
                        <button onClick={() => removeStaff(s.id)} disabled={removingStaffId === s.id} title="Remove staff access"
                          className="flex-shrink-0 text-sr-text-muted hover:text-red-400 transition-colors disabled:opacity-50">
                          {removingStaffId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
