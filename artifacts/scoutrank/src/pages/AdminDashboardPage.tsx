import { useState, useEffect } from 'react';
import { shortDate, timeAgo } from '@/utils/time';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName, displayScoutRank } from '@/lib/supabase';
import type { Profile, Post } from '@/lib/supabase';
import { Button } from '@/components/ui/BrandButton';
import { Logo } from '@/components/ui/Logo';
import { uploadResumable, publicUrlFor } from '@/lib/mediaStorage';
import { endOfDayISOString, applyRestriction } from '@/lib/accountModeration';
import { AdminAuditLog } from '@/components/AdminAuditLog';
import { AdminGlobalSearch } from '@/components/AdminGlobalSearch';
import { Select } from '@/components/ui/Select';
import {
  Users, Flag, Shield, BarChart3, Building2,
  Settings, MessageCircle,
  Trash2, Inbox, Loader2, LogOut, Ban, ShieldOff, CheckCircle2, Gavel, AlertTriangle, EyeOff, UserX, ShoppingBag, ShieldCheck, DollarSign,
} from 'lucide-react';

type AdminTab = 'analytics' | 'users' | 'posts' | 'reports' | 'verification' | 'disputes' | 'flagged' | 'organisations' | 'org_requests' | 'org_claims' | 'moderation' | 'deletion_requests' | 'marketplace_reviews' | 'seller_applications' | 'payouts' | 'evidence_reports' | 'settings';

const adminTabs: { id: AdminTab; label: string; icon: typeof Users; superAdminOnly?: boolean }[] = [
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'posts', label: 'Posts', icon: MessageCircle },
  { id: 'reports', label: 'Reports', icon: Flag },
  { id: 'verification', label: 'Verification', icon: Shield },
  { id: 'disputes', label: 'Disputes', icon: Gavel },
  { id: 'flagged', label: 'AI Flagged', icon: AlertTriangle },
  { id: 'organisations', label: 'Organisations', icon: Building2 },
  { id: 'org_requests',         label: 'Org Requests',         icon: Inbox },
  { id: 'moderation',           label: 'Moderation',           icon: ShieldOff, superAdminOnly: true },
  { id: 'deletion_requests',    label: 'Deletion Requests',    icon: UserX, superAdminOnly: true },
  { id: 'marketplace_reviews',  label: 'Combine Reviews',  icon: ShoppingBag },
  { id: 'seller_applications',  label: 'Seller Applications',  icon: ShieldCheck },
  { id: 'payouts',              label: 'Combine Payouts',      icon: DollarSign },
  { id: 'evidence_reports',     label: 'Evidence Reports',     icon: Flag },
  { id: 'org_claims',           label: 'Club Applications',    icon: Building2 },
  { id: 'settings',             label: 'Settings',             icon: Settings },
];

const ADMIN_TAB_IDS = new Set(adminTabs.map(t => t.id));

export default function AdminDashboardPage() {
  const { profile, isAdmin, isSuperAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // AdminTopNav (shown on every other /admin/* page) links to sections that
  // live here as ?tab= rather than their own route — read it on load so
  // those links (and any other deep link) land on the right tab.
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTabState] = useState<AdminTab>(
    tabParam && ADMIN_TAB_IDS.has(tabParam as AdminTab) ? (tabParam as AdminTab) : 'analytics'
  );
  // Keeps the URL in sync when switching tabs from the sidebar/mobile bar,
  // so the current tab can be bookmarked, shared, or linked to from
  // AdminTopNav on another admin page.
  const setActiveTab = (tab: AdminTab) => {
    setActiveTabState(tab);
    setSearchParams(tab === 'analytics' ? {} : { tab }, { replace: true });
  };
  const [searchQuery, setSearchQuery] = useState('');

  // ── Real data ──────────────────────────────────────────────────
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [analytics, setAnalytics] = useState({
    totalUsers: 0, totalPosts: 0, totalOrgs: 0,
    openDisputes: 0, pendingVerifications: 0, openFlags: 0, pendingReports: 0, pendingDeletions: 0, pendingMarketplaceReviews: 0, pendingSellerApplications: 0, pendingPayouts: 0, pendingEvidenceReports: 0, pendingOrgClaims: 0,
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  useEffect(() => {
    supabase.from('profiles').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setAllUsers((data as Profile[] | null) ?? []); setLoadingUsers(false); });

    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('id', { count: 'exact', head: true }),
      supabase.from('organisations').select('id', { count: 'exact', head: true }).eq('verified', true),
      supabase.from('stat_disputes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('verification_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('flagged_content').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('account_disputes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('account_deletion_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('marketplace_listing_reviews').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('seller_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('marketplace_orders').select('id', { count: 'exact', head: true }).eq('status', 'paid').eq('paid_out', false)
        .lte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('stat_evidence_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('organisation_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]).then(([users, posts, orgs, openStatDisputes, pendingVer, openFlags, pendingReports, openAccountDisputes, pendingDeletions, pendingMarketplaceReviews, pendingSellerApplications, pendingPayouts, pendingEvidenceReports, pendingOrgClaims]) => {
      setAnalytics({
        totalUsers:           users.count ?? 0,
        totalPosts:           posts.count ?? 0,
        totalOrgs:            orgs.count ?? 0,
        openDisputes:         (openStatDisputes.count ?? 0) + (openAccountDisputes.count ?? 0),
        pendingVerifications: pendingVer.count ?? 0,
        openFlags:            openFlags.count ?? 0,
        pendingReports:       pendingReports.count ?? 0,
        pendingDeletions:     pendingDeletions.count ?? 0,
        pendingMarketplaceReviews: pendingMarketplaceReviews.count ?? 0,
        pendingSellerApplications: pendingSellerApplications.count ?? 0,
        pendingPayouts: pendingPayouts.count ?? 0,
        pendingEvidenceReports: pendingEvidenceReports.count ?? 0,
        pendingOrgClaims: pendingOrgClaims.count ?? 0,
      });
      setLoadingAnalytics(false);
    });
  }, []);

  const [userStatuses, setUserStatuses] = useState<Record<string, Pick<Profile, 'account_status' | 'status_reason' | 'suspended_until' | 'status_changed_by' | 'status_changed_at' | 'status_evidence_url' | 'restricted_until'>>>({});
  const [actioningUser, setActioningUser] = useState<string | null>(null);
  const [userActionError, setUserActionError] = useState('');
  const [usersSubTab, setUsersSubTab] = useState<'all' | 'suspended' | 'banned' | 'restricted'>('all');
  const [moderationModal, setModerationModal] = useState<{ userId: string; userName: string; action: 'suspend' | 'ban' | 'restrict' } | null>(null);
  const [modalReason, setModalReason] = useState('');
  const [modalUntil, setModalUntil] = useState('');
  const [modalEvidenceUrl, setModalEvidenceUrl] = useState<string | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [evidenceUploadPercent, setEvidenceUploadPercent] = useState(0);

  const handleEvidenceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !moderationModal) return;
    setIsUploadingEvidence(true);
    setEvidenceUploadPercent(0);
    setUserActionError('');
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${moderationModal.userId}/${Date.now()}.${ext}`;
      await uploadResumable('moderation-evidence', path, file, {
        contentType: file.type,
        onProgress: p => setEvidenceUploadPercent(p.percent),
      });
      setModalEvidenceUrl(publicUrlFor('moderation-evidence', path));
    } catch (err) {
      setUserActionError(`Evidence upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  const currentStatusFor = (u: Profile) => userStatuses[u.id]?.account_status ?? u.account_status ?? 'active';

  const openModerationModal = (userId: string, userName: string, action: 'suspend' | 'ban' | 'restrict') => {
    setModerationModal({ userId, userName, action });
    setModalReason('');
    setModalUntil('');
    setModalEvidenceUrl(null);
    setUserActionError('');
  };

  const applyModeration = async () => {
    if (!moderationModal || !profile) return;
    const { userId, action } = moderationModal;
    if (!modalReason.trim()) { setUserActionError('A reason is required.'); return; }
    if (action === 'suspend' && !modalUntil) { setUserActionError('An end date is required for a suspension.'); return; }

    setActioningUser(userId);
    setUserActionError('');

    if (action === 'restrict') {
      const result = await applyRestriction({ performedBy: profile.id, targetUserId: userId, reason: modalReason.trim() });
      setActioningUser(null);
      if (!result.ok) { setUserActionError(result.error ?? 'Something went wrong.'); return; }
      const { data } = await supabase.from('profiles').select('account_status, status_reason, suspended_until, status_changed_by, status_changed_at, status_evidence_url, restricted_until').eq('id', userId).maybeSingle();
      if (data) setUserStatuses(prev => ({ ...prev, [userId]: data as Profile }));
      setModerationModal(null);
      return;
    }

    const status = action === 'suspend' ? 'suspended' : 'banned';
    const until = action === 'suspend' ? endOfDayISOString(modalUntil) : null;

    const { error, data } = await supabase.from('profiles').update({
      account_status: status,
      status_reason: modalReason.trim(),
      suspended_until: until,
      status_changed_by: profile.id,
      status_changed_at: new Date().toISOString(),
      status_evidence_url: modalEvidenceUrl,
    }).eq('id', userId).select('id, account_status, status_reason, suspended_until, status_changed_by, status_changed_at, status_evidence_url');

    if (error) { setUserActionError(`Failed to update status: ${error.message}`); setActioningUser(null); return; }
    if (!data || data.length === 0) {
      setUserActionError('Update did not apply — no row was changed. Check the admin UPDATE policy on profiles.');
      setActioningUser(null);
      return;
    }

    const { error: logErr } = await supabase.from('account_moderation_log').insert({
      profile_id: userId, action: status, reason: modalReason.trim(), suspended_until: until, performed_by: profile.id, evidence_url: modalEvidenceUrl,
    });
    setActioningUser(null);
    if (logErr) setUserActionError(`Status updated, but failed to log it: ${logErr.message}`);

    setUserStatuses(prev => ({ ...prev, [userId]: data[0] as Profile }));
    setModerationModal(null);
  };

  const releaseAccount = async (userId: string) => {
    if (!profile) return;
    setActioningUser(userId);
    setUserActionError('');
    const { error, data } = await supabase.from('profiles').update({
      account_status: 'active', status_reason: null, suspended_until: null, status_changed_by: null, status_changed_at: null, status_evidence_url: null, restricted_until: null,
    }).eq('id', userId).select('id, account_status, status_reason, suspended_until, status_changed_by, status_changed_at, status_evidence_url, restricted_until');
    if (error) { setUserActionError(`Failed to release: ${error.message}`); setActioningUser(null); return; }
    if (!data || data.length === 0) { setUserActionError('Release did not apply — no row was changed.'); setActioningUser(null); return; }

    const { error: logErr } = await supabase.from('account_moderation_log').insert({
      profile_id: userId, action: 'released', reason: null, suspended_until: null, performed_by: profile.id,
    });
    setActioningUser(null);
    if (logErr) setUserActionError(`Released, but failed to log it: ${logErr.message}`);
    setUserStatuses(prev => ({ ...prev, [userId]: data[0] as Profile }));
  };

  // Real posts list for the Posts moderation tab — was previously just
  // static placeholder text with no actual data or actions.
  const [allPosts, setAllPosts] = useState<(Post & { profiles: Profile })[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [deletingPost, setDeletingPost] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'posts' || allPosts.length > 0) return;
    setLoadingPosts(true);
    supabase.from('posts').select('*, profiles(*)').order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (error) console.error('[ADMIN] Failed to load posts:', error.message);
        setAllPosts((data as (Post & { profiles: Profile })[] | null) ?? []);
        setLoadingPosts(false);
      });
  }, [activeTab, allPosts.length]);

  const [deletePostError, setDeletePostError] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ id: string; caption: string | null; profileId: string }[] | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());

  const confirmDeletePost = async () => {
    if (!deleteModal || !profile) return;
    if (!deleteReason.trim()) { setDeletePostError('A reason is required.'); return; }
    const targets = deleteModal;
    setDeletingPost(targets[0].id);
    setDeletePostError('');

    const failures: string[] = [];
    for (const target of targets) {
      const { error, data } = await supabase.from('posts').delete().eq('id', target.id).select('id');
      if (error) { failures.push(`${target.id}: ${error.message}`); continue; }
      if (!data || data.length === 0) { failures.push(`${target.id}: no row changed (check admin DELETE policy)`); continue; }
      await supabase.from('post_removal_notices').insert({
        profile_id: target.profileId,
        post_caption: target.caption,
        reason: deleteReason.trim(),
        removed_by: profile.id,
      });
    }

    setDeletingPost(null);
    if (failures.length > 0) { setDeletePostError(`Failed to delete ${failures.length} of ${targets.length}: ${failures.join('; ')}`); }
    const deletedIds = new Set(targets.map(t => t.id));
    setAllPosts(prev => prev.filter(p => !deletedIds.has(p.id)));
    setSelectedPostIds(prev => { const next = new Set(prev); deletedIds.forEach(id => next.delete(id)); return next; });
    if (failures.length === 0) { setDeleteModal(null); setDeleteReason(''); }
  };

  const toggleSelectPost = (id: string) => {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalUsers = allUsers.length + 1; // +1 for admin
  const activeUsers = allUsers.filter(u => (userStatuses[u.id] || u.status) === 'active').length + 1;
  const bannedUsers = allUsers.filter(u => (userStatuses[u.id] || u.status) === 'banned').length;
  const suspendedUsers = allUsers.filter(u => (userStatuses[u.id] || u.status) === 'suspended').length;

  const badgeCountFor = (tabId: AdminTab): number => {
    switch (tabId) {
      case 'reports': return analytics.pendingReports;
      case 'disputes': return analytics.openDisputes;
      case 'flagged': return analytics.openFlags;
      case 'verification': return analytics.pendingVerifications;
      case 'deletion_requests': return analytics.pendingDeletions;
      case 'marketplace_reviews': return analytics.pendingMarketplaceReviews;
      case 'seller_applications': return analytics.pendingSellerApplications;
      case 'payouts': return analytics.pendingPayouts;
      case 'evidence_reports': return analytics.pendingEvidenceReports;
      case 'org_claims': return analytics.pendingOrgClaims;
      default: return 0;
    }
  };

  return (
    <div className="min-h-screen bg-sr-bg">
      {/* Header */}
      <div className="border-b border-sr-border bg-sr-surface/50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link to="/feed" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Logo size="sm" />
            </Link>
            <span className="h-5 w-px bg-sr-border hidden sm:block" />
            <span className="text-sm font-semibold text-sr-purple-light items-center gap-1.5 hidden sm:flex">
              <Shield className="h-4 w-4" /> Admin Dashboard
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
            <div className="min-w-0 flex-1 max-w-xs">
              <AdminGlobalSearch value={searchQuery} onChange={setSearchQuery} />
            </div>
            <Link to="/feed" title="Exit to App"
              className="flex-shrink-0 text-xs font-medium text-sr-text-muted hover:text-white transition-colors flex items-center gap-1.5 border border-sr-border rounded-lg px-2.5 py-1.5 hover:border-sr-purple/40">
              <LogOut className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Exit to App</span>
            </Link>
            <span className="text-xs text-sr-text-muted flex-shrink-0 hidden xl:inline">{profile ? fullName(profile) : ''} (Admin)</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row h-[calc(100vh-3.5rem)]">
        {/* Sidebar */}
        <aside className="w-56 border-r border-sr-border bg-sr-surface/30 overflow-y-auto flex-shrink-0 hidden md:block">
          <nav className="p-2 space-y-0.5">
            {adminTabs.filter(t => !t.superAdminOnly || isSuperAdmin).map(tab => {
              const badgeCount = badgeCountFor(tab.id);
              return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id ? 'bg-sr-purple/10 text-sr-purple-light border border-sr-purple/20' : 'text-sr-text-muted hover:text-white hover:bg-sr-surface-light'
                }`}>
                <tab.icon className="h-4 w-4" />{tab.label}
                {badgeCount > 0 && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-semibold">{badgeCount}</span>
                )}
              </button>
              );
            })}
          </nav>
        </aside>

        {/* Mobile tabs */}
        <div className="md:hidden relative w-full border-b border-sr-border bg-sr-surface/30">
          <div className="w-full overflow-x-auto">
            <div className="flex p-2 gap-1 w-max">
              {adminTabs.filter(t => !t.superAdminOnly || isSuperAdmin).map(tab => {
                const badgeCount = badgeCountFor(tab.id);
                return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${activeTab === tab.id ? 'bg-sr-purple/10 text-sr-purple-light' : 'text-sr-text-muted'}`}>
                  <tab.icon className="h-3.5 w-3.5" />{tab.label}
                  {badgeCount > 0 && (
                    <span className="text-[9px] px-1 py-0.5 rounded-full bg-red-500/20 text-red-400 font-semibold">{badgeCount}</span>
                  )}
                </button>
                );
              })}
            </div>
          </div>
          {/* Fade hints — makes it visually obvious there's more to scroll
              in either direction, rather than tabs just running off-screen
              with no indication more exist. */}
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-sr-surface to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-sr-surface to-transparent pointer-events-none" />
        </div>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'analytics' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Platform Analytics</h2>
              {loadingAnalytics ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'Total Users',   value: analytics.totalUsers,   icon: Users,        color: 'from-sr-purple to-sr-blue' },
                      { label: 'Total Posts',   value: analytics.totalPosts,   icon: MessageCircle,color: 'from-green-400 to-emerald-500' },
                      { label: 'Verified Orgs', value: analytics.totalOrgs,    icon: Building2,    color: 'from-sr-blue to-cyan-400' },
                    ].map(s => (
                      <div key={s.label} className="card-premium p-5">
                        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-3`}>
                          <s.icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="text-2xl font-bold text-white">{s.value}</div>
                        <div className="text-xs text-sr-text-muted">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'Open Disputes',                 value: analytics.openDisputes,          icon: Gavel,        color: 'text-yellow-400',  to: '/admin/disputes' },
                      { label: 'Pending Verifications',        value: analytics.pendingVerifications,  icon: Shield,       color: 'text-sr-purple-light', to: '/admin/verification' },
                      { label: 'AI Flagged Content',            value: analytics.openFlags,             icon: AlertTriangle, color: 'text-red-400',    to: '/admin/flagged' },
                    ].map(s => (
                      <Link key={s.label} to={s.to} className="card-premium p-5 hover:border-sr-purple/30 transition-colors group flex items-center gap-3">
                        <s.icon className={`h-6 w-6 ${s.color}`} />
                        <div className="flex-1">
                          <div className="text-xl font-bold text-white">{s.value}</div>
                          <div className="text-xs text-sr-text-muted">{s.label}</div>
                        </div>
                        {s.value > 0 && <span className="h-2 w-2 rounded-full bg-yellow-400 flex-shrink-0" />}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

                    {activeTab === 'users' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Users ({allUsers.length})</h2>
                <input className="input-dark py-1.5 text-xs w-56 pl-3" placeholder="Search name or username..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>

              <div className="flex gap-2 mb-4">
                {([
                  ['all', 'All'],
                  ['restricted', 'Restricted'],
                  ['suspended', 'Suspended'],
                  ['banned', 'Banned'],
                ] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setUsersSubTab(id)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      usersSubTab === id ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {userActionError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <Ban className="h-4 w-4 flex-shrink-0" />{userActionError}
                </div>
              )}
              {loadingUsers ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
              ) : (
                <div className="card-premium overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead><tr className="text-left text-xs text-sr-text-muted border-b border-sr-border">
                      <th className="p-3 pl-6">User</th><th className="p-3">Role</th><th className="p-3">Joined</th><th className="p-3">Score</th><th className="p-3">Status</th><th className="p-3 pr-6">Actions</th>
                    </tr></thead>
                    <tbody>
                      {allUsers
                        .filter(u => !searchQuery || fullName(u).toLowerCase().includes(searchQuery.toLowerCase()) || u.username.toLowerCase().includes(searchQuery.toLowerCase()))
                        .filter(u => usersSubTab === 'all' || currentStatusFor(u) === usersSubTab)
                        .map(u => {
                          const status = currentStatusFor(u);
                          const reason = userStatuses[u.id]?.status_reason ?? u.status_reason;
                          const until = userStatuses[u.id]?.suspended_until ?? u.suspended_until;
                          return (
                          <tr key={u.id} className="border-b border-sr-border/50 hover:bg-sr-surface-light/50 align-top">
                            <td className="p-3 pl-6">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg overflow-hidden flex-shrink-0">
                                  {u.avatar_url
                                    ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                                    : <div className="h-full w-full bg-gradient-to-br from-sr-purple/50 to-sr-blue/50 flex items-center justify-center text-xs font-bold text-white">{u.first_name?.[0]}{u.last_name?.[0]}</div>
                                  }
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">{fullName(u)}</p>
                                  <p className="text-xs text-sr-text-muted">@{u.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                u.role === 'admin' || u.role === 'super_admin' ? 'bg-sr-purple/10 text-sr-purple-light' :
                                u.role === 'coach' ? 'bg-blue-500/10 text-blue-400' :
                                u.role === 'scout' ? 'bg-green-500/10 text-green-400' :
                                u.role === 'parent' ? 'bg-orange-500/10 text-orange-400' :
                                'bg-sr-surface text-sr-text-muted'
                              }`}>{u.role}</span>
                            </td>
                            <td className="p-3 text-xs text-sr-text-muted">{shortDate(u.created_at)}</td>
                            <td className="p-3 text-xs text-sr-silver">{displayScoutRank(u.scoutrank_score)}</td>
                            <td className="p-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                status === 'banned' ? 'bg-red-500/10 text-red-400' :
                                status === 'suspended' ? 'bg-yellow-500/10 text-yellow-400' :
                                status === 'restricted' ? 'bg-blue-500/10 text-blue-400' :
                                'bg-green-500/10 text-green-400'
                              }`}>{status}</span>
                              {/* Reason + duration only — who did it is deliberately not shown
                                  here, that's restricted to the super_admin-only Moderation tab. */}
                              {(status === 'suspended' || status === 'banned') && reason && (
                                <p className="text-[10px] text-sr-text-muted mt-1 max-w-[180px]">{reason}</p>
                              )}
                              {status === 'suspended' && until && (
                                <p className="text-[10px] text-sr-text-muted mt-0.5">Until {new Date(until).toLocaleDateString()}</p>
                              )}
                            </td>
                            <td className="p-3 pr-6">
                              {u.role === 'admin' || u.role === 'super_admin' ? (
                                <span className="text-xs text-sr-text-muted">—</span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {status === 'active' && (
                                    <>
                                      <button onClick={() => openModerationModal(u.id, fullName(u), 'restrict')} disabled={actioningUser === u.id}
                                        title="Restrict (7 days, hides posts/comments/followers)" className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 disabled:opacity-50">
                                        <EyeOff className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => openModerationModal(u.id, fullName(u), 'suspend')} disabled={actioningUser === u.id}
                                        title="Suspend" className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-50">
                                        <ShieldOff className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => openModerationModal(u.id, fullName(u), 'ban')} disabled={actioningUser === u.id}
                                        title="Ban" className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                                        <Ban className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                  {(status === 'banned' || status === 'suspended' || status === 'restricted') && (
                                    <button onClick={() => releaseAccount(u.id)} disabled={actioningUser === u.id}
                                      title="Lift restriction/suspension/ban" className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 disabled:opacity-50">
                                      {actioningUser === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );})
                      }
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'posts' && (
            <div>
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <h2 className="text-xl font-bold text-white">Post Moderation ({allPosts.length})</h2>
                {selectedPostIds.size > 0 && (
                  <button onClick={() => { setDeleteModal(allPosts.filter(p => selectedPostIds.has(p.id)).map(p => ({ id: p.id, caption: p.caption, profileId: p.profile_id }))); setDeleteReason(''); setDeletePostError(''); }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600">
                    <Trash2 className="h-3.5 w-3.5" /> Delete Selected ({selectedPostIds.size})
                  </button>
                )}
              </div>
              {deletePostError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <Ban className="h-4 w-4 flex-shrink-0" />{deletePostError}
                </div>
              )}
              {loadingPosts ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
              ) : allPosts.length === 0 ? (
                <div className="card-premium p-12 text-center">
                  <MessageCircle className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
                  <p className="text-sr-text-muted">No posts yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {allPosts.map(post => (
                    <div key={post.id} className={`card-premium p-4 flex items-start gap-3 ${selectedPostIds.has(post.id) ? 'border-sr-purple/40' : ''}`}>
                      <input type="checkbox" checked={selectedPostIds.has(post.id)} onChange={() => toggleSelectPost(post.id)}
                        className="mt-1.5 flex-shrink-0" />
                      <div className="h-8 w-8 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple/50 to-sr-blue/50 flex items-center justify-center text-xs font-bold text-white">
                        {post.profiles?.avatar_url
                          ? <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                          : <>{post.profiles?.first_name?.[0]}{post.profiles?.last_name?.[0]}</>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">{post.profiles ? fullName(post.profiles) : 'Unknown'}</p>
                          <span className="text-xs text-sr-text-muted">@{post.profiles?.username}</span>
                          <span className="text-xs text-sr-text-muted">· {shortDate(post.created_at)}</span>
                        </div>
                        {post.caption && <p className="text-sm text-sr-silver mt-1 line-clamp-2">{post.caption}</p>}
                        {post.media_url && (
                          <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-sr-text-muted">
                            {post.media_type === 'video' ? 'Video attached' : post.media_type === 'photo' ? 'Photo attached' : 'Media attached'}
                          </span>
                        )}
                      </div>
                      <button onClick={() => { setDeleteModal([{ id: post.id, caption: post.caption, profileId: post.profile_id }]); setDeleteReason(''); setDeletePostError(''); }} disabled={deletingPost === post.id}
                        title="Delete post" className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50 flex-shrink-0">
                        {deletingPost === post.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'verification' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Coach &amp; Scout Verification</h2>
              <div className="card-premium p-8 text-center">
                <Shield className="h-12 w-12 mx-auto text-sr-purple mb-4" />
                <p className="text-white font-semibold mb-2">Verification Queue</p>
                <p className="text-sm text-sr-text-muted mb-4">
                  Review submitted ID/coaching credentials and approve or reject coach and scout verification requests.
                </p>
                <Link to="/admin/verification">
                  <Button variant="brand" icon={<Shield className="h-4 w-4" />}>Open Verification Queue</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'organisations' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Organisation Registry</h2>
              <div className="card-premium p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto text-sr-purple mb-4" />
                <p className="text-white font-semibold mb-2">Clubs, Schools &amp; Academies</p>
                <p className="text-sm text-sr-text-muted mb-4">
                  Add, edit and verify organisations. Verified organisations appear in autocomplete when coaches and scouts submit for verification.
                </p>
                <Link to="/admin/organisations">
                  <Button variant="brand" icon={<Building2 className="h-4 w-4" />}>Open Organisation Registry</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'org_requests' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Organisation Requests</h2>
              <div className="card-premium p-8 text-center">
                <Inbox className="h-12 w-12 mx-auto text-sr-purple mb-4" />
                <p className="text-white font-semibold mb-2">User-Submitted Organisation Requests</p>
                <p className="text-sm text-sr-text-muted mb-4">
                  Review, approve or reject requests to add new clubs, schools and academies to the registry.
                </p>
                <Link to="/admin/organisation-requests">
                  <Button variant="brand" icon={<Inbox className="h-4 w-4" />}>Open Org Requests Queue</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'disputes' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Disputes</h2>
              <div className="card-premium p-8 text-center">
                <Gavel className="h-12 w-12 mx-auto text-sr-purple mb-4" />
                <p className="text-white font-semibold mb-2">Human Review Queue</p>
                <p className="text-sm text-sr-text-muted mb-4">Stats the AI declined to auto-approve get queued here — a person makes the final call. Stat verification is otherwise fully automated now.</p>
                <Link to="/admin/disputes">
                  <Button variant="brand" icon={<Gavel className="h-4 w-4" />}>Open Disputes</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'flagged' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">AI Flagged Content</h2>
              <div className="card-premium p-8 text-center">
                <AlertTriangle className="h-12 w-12 mx-auto text-yellow-400 mb-4" />
                <p className="text-white font-semibold mb-2">Content Moderation Queue</p>
                <p className="text-sm text-sr-text-muted mb-4">Posts and highlights AI flagged as potentially inappropriate or dangerous when submitted. Nothing gets removed automatically — review and decide here.</p>
                <Link to="/admin/flagged">
                  <Button variant="brand" icon={<AlertTriangle className="h-4 w-4" />}>Open Flagged Content</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Reports</h2>
              <div className="card-premium p-8 text-center">
                <Flag className="h-12 w-12 mx-auto text-red-400 mb-4" />
                <p className="text-white font-semibold mb-2">User Reports</p>
                <p className="text-sm text-sr-text-muted mb-4">Review reports submitted by athletes for profiles, posts and messages.</p>
                <Link to="/admin/reports">
                  <Button variant="brand" icon={<Flag className="h-4 w-4" />}>Open Reports</Button>
                </Link>
              </div>
            </div>
          )}



          {activeTab === 'moderation' && isSuperAdmin && <ModerationTab />}

          {activeTab === 'deletion_requests' && isSuperAdmin && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Account Deletion Requests</h2>
              <div className="card-premium p-8 text-center">
                <UserX className="h-12 w-12 mx-auto text-red-400 mb-4" />
                <p className="text-white font-semibold mb-2">Review &amp; Complete Deletions</p>
                <p className="text-sm text-sr-text-muted mb-4">Someone requesting to delete their account queues here — nothing happens automatically. Approving here is permanent and can't be undone.</p>
                <Link to="/admin/deletion-requests">
                  <Button variant="brand" icon={<UserX className="h-4 w-4" />}>Open Deletion Requests</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'marketplace_reviews' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Combine Listing Reviews</h2>
              <div className="card-premium p-8 text-center">
                <ShoppingBag className="h-12 w-12 mx-auto text-sr-purple-light mb-4" />
                <p className="text-white font-semibold mb-2">Review Flagged Listings</p>
                <p className="text-sm text-sr-text-muted mb-4">New listings are AI-screened automatically — most go live within seconds. Anything the AI isn't confident about lands here for a human call.</p>
                <Link to="/admin/combine-reviews">
                  <Button variant="brand" icon={<ShoppingBag className="h-4 w-4" />}>Open Combine Reviews</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'seller_applications' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Seller Applications</h2>
              <div className="card-premium p-8 text-center">
                <ShieldCheck className="h-12 w-12 mx-auto text-sr-purple-light mb-4" />
                <p className="text-white font-semibold mb-2">Review Who Can Sell</p>
                <p className="text-sm text-sr-text-muted mb-4">Selling on Combine requires approval — review each applicant before they can list anything.</p>
                <Link to="/admin/seller-applications">
                  <Button variant="brand" icon={<ShieldCheck className="h-4 w-4" />}>Open Seller Applications</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'payouts' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Combine Payouts</h2>
              <div className="card-premium p-8 text-center">
                <DollarSign className="h-12 w-12 mx-auto text-sr-purple-light mb-4" />
                <p className="text-white font-semibold mb-2">Pay Out Sellers</p>
                <p className="text-sm text-sr-text-muted mb-4">No Stripe Connect yet, so payouts are sent manually — this shows who's owed money and lets you mark it as paid once you've sent it.</p>
                <Link to="/admin/payouts">
                  <Button variant="brand" icon={<DollarSign className="h-4 w-4" />}>Open Combine Payouts</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'evidence_reports' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Evidence Reports</h2>
              <div className="card-premium p-8 text-center">
                <Flag className="h-12 w-12 mx-auto text-sr-purple-light mb-4" />
                <p className="text-white font-semibold mb-2">Review Flagged Evidence</p>
                <p className="text-sm text-sr-text-muted mb-4">Any user can now report a stat's evidence if they think the AI got it wrong — review each report and decide whether to flag the stat.</p>
                <Link to="/admin/evidence-reports">
                  <Button variant="brand" icon={<Flag className="h-4 w-4" />}>Open Evidence Reports</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'org_claims' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Club Applications</h2>
              <div className="card-premium p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto text-sr-purple-light mb-4" />
                <p className="text-white font-semibold mb-2">Review Claim & Registration Requests</p>
                <p className="text-sm text-sr-text-muted mb-4">People can now claim an existing unclaimed club or register a brand new one — review each application and verify they're actually authorised to represent it before approving.</p>
                <Link to="/admin/organisation-claims">
                  <Button variant="brand" icon={<Building2 className="h-4 w-4" />}>Open Club Applications</Button>
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'settings' && <SettingsTab allUsers={allUsers} onRoleChanged={(userId, role) => setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, role } as Profile : u))} />}
        </main>
      </div>

      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteModal(null)}>
          <div className="w-full max-w-sm card-premium p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Delete {deleteModal.length > 1 ? `${deleteModal.length} Posts` : 'Post'}</h3>
            <p className="text-xs text-sr-text-muted mb-4">
              {deleteModal.length > 1 ? "Each post's owner" : "The post's owner"} will be shown this reason the next time they use the app.
            </p>

            {deletePostError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{deletePostError}</div>
            )}

            <label className="block text-xs text-sr-text-muted mb-1">Reason</label>
            <textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} rows={3}
              className="input-dark w-full resize-none text-sm mb-3" placeholder="Why is this post being removed?" />

            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteModal(null)} className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                Cancel
              </button>
              <button onClick={confirmDeletePost} disabled={deletingPost === deleteModal[0]?.id}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                {deletingPost === deleteModal[0]?.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete {deleteModal.length > 1 ? `${deleteModal.length} Posts` : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {moderationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setModerationModal(null)}>
          <div className="w-full max-w-sm card-premium p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">
              {moderationModal.action === 'suspend' ? 'Suspend' : moderationModal.action === 'restrict' ? 'Restrict' : 'Ban'} {moderationModal.userName}
            </h3>
            <p className="text-xs text-sr-text-muted mb-4">
              {moderationModal.action === 'suspend'
                ? 'A reason and an end date are both required.'
                : moderationModal.action === 'restrict'
                ? 'A reason is required. Lasts exactly 7 days — their posts, comments, and followers become invisible to everyone but them; they\'ll be told why.'
                : 'A reason is required. Bans have no expiry — they last until manually lifted.'}
            </p>

            {userActionError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{userActionError}</div>
            )}

            <label className="block text-xs text-sr-text-muted mb-1">Reason</label>
            <textarea value={modalReason} onChange={e => setModalReason(e.target.value)} rows={3}
              className="input-dark w-full resize-none text-sm mb-3" placeholder="Why is this account being restricted?" />

            {moderationModal.action === 'suspend' && (
              <>
                <label className="block text-xs text-sr-text-muted mb-1">Suspended until</label>
                <input type="date" value={modalUntil} onChange={e => setModalUntil(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="input-dark w-full text-sm mb-3" />
              </>
            )}

            {moderationModal.action !== 'restrict' && (
              <>
                <label className="block text-xs text-sr-text-muted mb-1">
                  Evidence <span className="text-sr-text-muted font-normal">(photo or video, optional but shown to the person)</span>
                </label>
                <input type="file" accept="image/*,video/*" onChange={handleEvidenceFileChange} disabled={isUploadingEvidence}
                  className="block w-full text-xs text-sr-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sr-surface-light file:text-sr-silver mb-1" />
                {isUploadingEvidence && (
                  <div className="mb-2">
                    <p className="text-xs text-sr-text-muted mb-1">Uploading... {evidenceUploadPercent}%</p>
                    <div className="h-1.5 w-full rounded-full bg-sr-border overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-sr-purple to-sr-blue transition-all duration-200" style={{ width: `${evidenceUploadPercent}%` }} />
                    </div>
                  </div>
                )}
                {modalEvidenceUrl && !isUploadingEvidence && (
                  <p className="text-xs text-green-400 mb-3 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Evidence attached</p>
                )}
                {!modalEvidenceUrl && !isUploadingEvidence && <div className="mb-3" />}
              </>
            )}

            <div className="flex gap-2 justify-end mt-2">
              <button onClick={() => setModerationModal(null)} className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                Cancel
              </button>
              <button onClick={applyModeration} disabled={actioningUser === moderationModal.userId || isUploadingEvidence}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50 ${
                  moderationModal.action === 'ban' ? 'bg-red-500 hover:bg-red-600' : moderationModal.action === 'restrict' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-yellow-500 hover:bg-yellow-600'
                }`}>
                {actioningUser === moderationModal.userId
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : moderationModal.action === 'suspend' ? <ShieldOff className="h-3.5 w-3.5" /> : moderationModal.action === 'restrict' ? <EyeOff className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                Confirm {moderationModal.action === 'suspend' ? 'Suspension' : moderationModal.action === 'restrict' ? 'Restriction' : 'Ban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SETTINGS ─────────────────────────────────────────────────────────
// Role management is the one thing here that's genuinely super_admin-only
// — a regular admin can see this tab but not change anyone's role from
// it. Super_admins themselves aren't editable through this list (avoids
// accidentally locking every super_admin out of the platform).

const ROLE_OPTIONS = ['athlete', 'coach', 'scout', 'parent', 'admin'] as const;

function SettingsTab({ allUsers, onRoleChanged }: { allUsers: Profile[]; onRoleChanged: (userId: string, role: Profile['role']) => void }) {
  const { isSuperAdmin, profile } = useAuth();
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [roleError, setRoleError] = useState('');

  const changeRole = async (userId: string, newRole: Profile['role']) => {
    setChangingRole(userId);
    setRoleError('');
    const oldUser = allUsers.find(u => u.id === userId);
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) { setRoleError(error.message); setChangingRole(null); return; }
    if (profile) {
      await supabase.from('account_moderation_log').insert({
        profile_id: userId,
        action: 'role_changed',
        reason: `Changed role from ${oldUser?.role ?? 'unknown'} to ${newRole}`,
        performed_by: profile.id,
      });
    }
    setChangingRole(null);
    onRoleChanged(userId, newRole);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">Admin Settings</h2>

      <div className="mb-6"><AdminAuditLog /></div>

      <div className="card-premium p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-1">Content Policy — Admin Reference</h3>
        <p className="text-xs text-sr-text-muted mb-4">A quick reference so decisions stay consistent between admins. Not exhaustive — use judgment for anything not covered here.</p>
        <div className="space-y-3 text-xs text-sr-silver">
          <div><span className="font-semibold text-white">Always remove / ban-tier:</span> sexual content involving or sexualizing minors, credible threats of violence, doxxing, hate symbols or slurs, content promoting self-harm or suicide.</div>
          <div><span className="font-semibold text-white">Suspend-tier:</span> harassment or bullying directed at a specific person, graphic violence/gore, dangerous stunts likely to be imitated, repeated spam.</div>
          <div><span className="font-semibold text-white">Warning-tier (first offense, account stays active):</span> borderline trash talk that crosses into personal attacks, minor policy misunderstandings, first-time minor rule violations.</div>
          <div><span className="font-semibold text-white">Not a violation:</span> normal competitive intensity, ordinary sports contact, strong-but-generic trash talk, disagreements without personal attacks, normal athletic clothing.</div>
          <div><span className="font-semibold text-white">Repeat offenders:</span> check History before deciding — a warning-tier issue becomes suspend-tier on a second offense from the same account, and suspend-tier becomes ban-tier on a third.</div>
        </div>
      </div>

      <div className="card-premium p-6">
        <h3 className="text-sm font-semibold text-white mb-1">Admin Role Management</h3>
        <p className="text-xs text-sr-text-muted mb-4">
          {isSuperAdmin
            ? 'Promote a user to admin, or change any non-super-admin\'s role. Super_admin accounts aren\'t editable from here.'
            : 'Only super_admin accounts can change user roles.'}
        </p>

        {roleError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <Ban className="h-4 w-4 flex-shrink-0" />{roleError}
          </div>
        )}

        <div className="space-y-2">
          {allUsers.filter(u => u.role !== 'super_admin').map(u => (
            <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-sr-surface-light/50">
              <div className="h-8 w-8 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple/50 to-sr-blue/50 flex items-center justify-center text-xs font-bold text-white">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : <>{u.first_name?.[0]}{u.last_name?.[0]}</>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{fullName(u)}</p>
                <p className="text-xs text-sr-text-muted">@{u.username}</p>
              </div>
              {isSuperAdmin ? (
                <div className="w-32 flex-shrink-0">
                  <Select
                    value={u.role}
                    disabled={changingRole === u.id}
                    onChange={v => changeRole(u.id, v as Profile['role'])}
                    options={ROLE_OPTIONS.map(r => ({ value: r, label: r }))}
                    className="text-xs"
                  />
                </div>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-sr-surface text-sr-text-muted">{u.role}</span>
              )}
              {changingRole === u.id && <Loader2 className="h-3.5 w-3.5 text-sr-purple animate-spin flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MODERATION (super_admin only) ───────────────────────────────────
// This is deliberately separate from the Users tab's Suspended/Banned
// sub-tabs: those are visible and actionable by any admin but never show
// WHO restricted an account — only super_admin gets that detail, here.

interface ModerationProfileRow {
  id: string; first_name: string; last_name: string; username: string; avatar_url: string | null;
  account_status: string | null; status_reason: string | null; suspended_until: string | null; restricted_until: string | null;
  status_changed_by: string | null; status_changed_at: string | null;
  changed_by_profile?: { first_name: string; last_name: string; username: string } | null;
}

interface ReleasedLogRow {
  id: string; created_at: string; profile_id: string; performed_by: string | null;
  target_profile?: { first_name: string; last_name: string; username: string } | null;
  performer_profile?: { first_name: string; last_name: string; username: string } | null;
}

function ModerationTab() {
  const { profile } = useAuth();
  const [subTab, setSubTab] = useState<'active' | 'released' | 'evasion'>('active');
  const [restricted, setRestricted] = useState<ModerationProfileRow[]>([]);
  const [released, setReleased] = useState<ReleasedLogRow[]>([]);
  const [evasionMatches, setEvasionMatches] = useState<{ account: ModerationProfileRow; matchesBanned: { username: string; first_name: string; last_name: string } }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const releaseFromModeration = async (userId: string) => {
    if (!profile) return;
    setReleasingId(userId);
    setError('');
    const { error: updateErr, data } = await supabase.from('profiles').update({
      account_status: 'active', status_reason: null, suspended_until: null, status_changed_by: null, status_changed_at: null, restricted_until: null,
    }).eq('id', userId).select('id');
    if (updateErr) { setError(`Failed to release: ${updateErr.message}`); setReleasingId(null); return; }
    if (!data || data.length === 0) { setError('Release did not apply — no row was changed.'); setReleasingId(null); return; }
    const { error: logErr } = await supabase.from('account_moderation_log').insert({
      profile_id: userId, action: 'released', reason: null, suspended_until: null, performed_by: profile.id,
    });
    setReleasingId(null);
    if (logErr) { setError(`Released, but failed to log it: ${logErr.message}`); return; }
    setRestricted(prev => prev.filter(u => u.id !== userId));
  };

  useEffect(() => {
    setIsLoading(true);
    setError('');
    if (subTab === 'active') {
      supabase
        .from('profiles')
        .select('id, first_name, last_name, username, avatar_url, account_status, status_reason, suspended_until, restricted_until, status_changed_by, status_changed_at, changed_by_profile:status_changed_by(first_name, last_name, username)')
        .in('account_status', ['suspended', 'banned', 'restricted'])
        .order('status_changed_at', { ascending: false })
        .then(({ data, error: qErr }) => {
          if (qErr) { setError(qErr.message); setIsLoading(false); return; }
          setRestricted((data as unknown as ModerationProfileRow[]) ?? []);
          setIsLoading(false);
        });
    } else if (subTab === 'released') {
      supabase
        .from('account_moderation_log')
        .select('id, created_at, profile_id, performed_by, target_profile:profile_id(first_name, last_name, username), performer_profile:performed_by(first_name, last_name, username)')
        .eq('action', 'released')
        .order('created_at', { ascending: false })
        .limit(100)
        .then(({ data, error: qErr }) => {
          if (qErr) { setError(qErr.message); setIsLoading(false); return; }
          setReleased((data as unknown as ReleasedLogRow[]) ?? []);
          setIsLoading(false);
        });
    } else {
      // Cross-reference active accounts' signup IP against banned
      // accounts' signup IP — a match doesn't prove evasion (shared
      // networks like schools/families are common false positives), it
      // just flags it for a human to actually look at.
      (async () => {
        const [bannedRes, activeRes] = await Promise.all([
          supabase.from('profiles').select('id, username, first_name, last_name, signup_ip').eq('account_status', 'banned').not('signup_ip', 'is', null),
          supabase.from('profiles').select('id, first_name, last_name, username, avatar_url, account_status, status_reason, suspended_until, restricted_until, status_changed_by, status_changed_at, signup_ip').eq('account_status', 'active').not('signup_ip', 'is', null),
        ]);
        if (bannedRes.error) { setError(bannedRes.error.message); setIsLoading(false); return; }
        if (activeRes.error) { setError(activeRes.error.message); setIsLoading(false); return; }

        const bannedByIp = new Map<string, { username: string; first_name: string; last_name: string }>();
        (bannedRes.data ?? []).forEach(b => { if (b.signup_ip) bannedByIp.set(b.signup_ip, b); });

        const matches = ((activeRes.data ?? []) as unknown as (ModerationProfileRow & { signup_ip: string | null })[])
          .filter(a => a.signup_ip && bannedByIp.has(a.signup_ip))
          .map(a => ({ account: a, matchesBanned: bannedByIp.get(a.signup_ip!)! }));

        setEvasionMatches(matches);
        setIsLoading(false);
      })();
    }
  }, [subTab]);

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Moderation</h2>
      <p className="text-sm text-sr-text-muted mb-6">Full detail on account restrictions — who did it, why, and for how long. Super_admin only.</p>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex gap-2">
          {([['active', 'Suspended & Banned'], ['released', 'Released'], ['evasion', 'Possible Ban Evasion']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setSubTab(id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                subTab === id ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search name or username..." className="input-dark !w-56 text-xs py-1.5" />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : subTab === 'active' ? (
        restricted.filter(u => !searchQuery || `${u.first_name} ${u.last_name} ${u.username}`.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
          <div className="card-premium p-12 text-center">
            <ShieldOff className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
            <p className="text-white font-semibold mb-1">No suspended or banned accounts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {restricted
              .filter(u => !searchQuery || `${u.first_name} ${u.last_name} ${u.username}`.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(u => (
              <div key={u.id} className="card-premium p-4 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple/50 to-sr-blue/50 flex items-center justify-center text-xs font-bold text-white">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : <>{u.first_name?.[0]}{u.last_name?.[0]}</>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-medium text-white">{u.first_name} {u.last_name} (@{u.username})</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                      u.account_status === 'banned' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                      u.account_status === 'restricted' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' :
                      'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
                    }`}>{u.account_status}</span>
                  </div>
                  {u.status_reason && <p className="text-xs text-sr-silver mb-1">{u.status_reason}</p>}
                  <p className="text-xs text-sr-text-muted">
                    {u.account_status === 'suspended' && u.suspended_until && `Until ${new Date(u.suspended_until).toLocaleDateString()} · `}
                    {u.account_status === 'restricted' && u.restricted_until && `Until ${new Date(u.restricted_until).toLocaleDateString()} · `}
                    By {u.changed_by_profile ? `${u.changed_by_profile.first_name} ${u.changed_by_profile.last_name} (@${u.changed_by_profile.username})` : 'unknown'}
                    {u.status_changed_at && ` · ${timeAgo(u.status_changed_at)}`}
                  </p>
                </div>
                <button onClick={() => releaseFromModeration(u.id)} disabled={releasingId === u.id}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 disabled:opacity-50 flex-shrink-0">
                  {releasingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Release
                </button>
              </div>
            ))}
          </div>
        )
      ) : subTab === 'released' ? (
        released.length === 0 ? (
          <div className="card-premium p-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
            <p className="text-white font-semibold mb-1">No early releases</p>
            <p className="text-sm text-sr-text-muted">Only shows accounts an admin manually released before their suspension ended — not ones that simply expired.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {released.map(r => (
              <div key={r.id} className="card-premium p-4 text-sm text-sr-silver">
                <span className="text-white font-medium">
                  {r.target_profile ? `${r.target_profile.first_name} ${r.target_profile.last_name} (@${r.target_profile.username})` : 'Unknown account'}
                </span>{' '}
                was released by{' '}
                <span className="text-white font-medium">
                  {r.performer_profile ? `${r.performer_profile.first_name} ${r.performer_profile.last_name} (@${r.performer_profile.username})` : 'unknown'}
                </span>
                <span className="text-xs text-sr-text-muted ml-2">{timeAgo(r.created_at)}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        evasionMatches.length === 0 ? (
          <div className="card-premium p-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
            <p className="text-white font-semibold mb-1">No matches found</p>
            <p className="text-sm text-sr-text-muted">No currently-active account shares a signup IP with a currently-banned account.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 mb-2">
              A match here isn't proof of evasion on its own — shared networks (schools, families, public wifi) can cause false positives. Use judgment.
            </p>
            {evasionMatches.map(({ account, matchesBanned }) => (
              <div key={account.id} className="card-premium p-4 text-sm text-sr-silver">
                <Link to={`/profile/${account.username}`} className="text-white font-medium hover:text-sr-purple-light">
                  {account.first_name} {account.last_name} (@{account.username})
                </Link>{' '}
                shares a signup IP with banned account{' '}
                <span className="text-red-400 font-medium">{matchesBanned.first_name} {matchesBanned.last_name} (@{matchesBanned.username})</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
