import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/BrandButton';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import type { Notification, Profile } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { StrengthIcon } from '@/components/icons';
import {
  Search, Bell, Menu, X, User, LogOut, Settings, Shield, BarChart3, TrendingUp,
  MessageCircle, Reply, UserPlus, Mail, Share2, Users, Trophy, Compass, Bot, ShoppingBag, Building2,
} from 'lucide-react';

// Icon + text per notification type — open-ended switch, adding a new
// type later (e.g. an AI-verification result) needs only a new case
// here, not a schema change. No emojis — plain lucide icons matching
// the rest of the app's visual language, professional copy.
function describeNotification(n: Notification, actorName: string): { Icon: typeof Bell; text: string } {
  switch (n.type) {
    case 'stat_verified':  return { Icon: BarChart3, text: n.metadata?.movement_text as string | undefined ?? 'Your stat was verified — your ScoutRank score has been updated' };
    case 'stat_rejected':  return { Icon: BarChart3, text: n.metadata?.rejection_text as string | undefined ?? 'Your stat submission was not verified' };
    case 'achievement':    return { Icon: Trophy,    text: `${actorName} posted a new achievement` };
    case 'reaction': return { Icon: StrengthIcon as unknown as typeof Bell, text: `${actorName} reacted to your post` };
    case 'comment': return { Icon: MessageCircle, text: `${actorName} commented on your post` };
    case 'reply': return { Icon: Reply, text: `${actorName} replied to your comment` };
    case 'follow': return { Icon: UserPlus, text: `${actorName} followed you` };
    case 'message': return { Icon: Mail, text: `New message from ${actorName}` };
    case 'coach_contacted_child': return { Icon: Shield, text: `${actorName} (verified coach/scout) messaged your linked athlete for the first time` };
    case 'marketplace_purchase_request': return { Icon: ShoppingBag, text: `${actorName} wants to purchase your listing` };
    case 'listing_removed': return { Icon: ShoppingBag, text: `Your Combine listing was removed` };
    case 'shared_post': return { Icon: Share2, text: `${actorName} shared a post with you` };
    case 'verification_approved': return { Icon: Shield, text: 'Your verification was approved' };
    case 'verification_rejected': return { Icon: Shield, text: 'Your verification was not approved' };
    case 'verification_more_info': return { Icon: Shield, text: 'More information needed for your verification' };
    case 'parent_link_request': return { Icon: Users, text: `${actorName} requested parent access to your profile` };
    case 'parent_link_approved': return { Icon: Users, text: `${actorName} approved your parent link request` };
    case 'parent_link_rejected': return { Icon: Users, text: `${actorName} declined your parent link request` };
    case 'parent_link_revoked': return { Icon: Users, text: 'A parent link was removed' };
    case 'club_coach_invite': return { Icon: Building2, text: `${actorName} invited you to join their club as a coach/scout` };
    case 'club_athlete_invite': return { Icon: Building2, text: `${actorName} invited you to join their club as a player` };
    case 'club_invite_accepted': return { Icon: Building2, text: `${actorName} accepted your club invite` };
    default: return { Icon: Bell, text: 'New notification' };
  }
}

// Where clicking a notification should go. Async because the 'comment'
// case needs one lookup (the comment's post_id) before it can build the
// route — comment/reply notifications target the comment itself now
// (SQL #32), not the post, so the highlight target is known.
async function resolveNotificationRoute(n: Notification, actor?: Profile): Promise<string> {
  if (n.target_type === 'post') return `/post/${n.target_id}`;
  if (n.target_type === 'comment') {
    const { data, error } = await supabase.from('post_comments').select('post_id').eq('id', n.target_id).maybeSingle();
    if (error || !data) {
      console.error('[notifications] Could not resolve comment target, falling back to dashboard:', error?.message);
      return '/dashboard';
    }
    return `/post/${data.post_id}?highlight=${n.target_id}`;
  }
  if (n.target_type === 'stat') {
    // Link to the athlete's own profile stats tab
    const username = actor?.username;
    return username ? `/profile/${username}?tab=stats` : '/dashboard';
  }
  // A parent isn't a real participant in their child's conversation with
  // a coach/scout — routing this into the normal Feed messaging UI (built
  // around "my own conversations") would show nothing. This goes to a
  // dedicated read-only view instead, backed by its own RLS policy that
  // specifically grants a parent read access to a linked child's
  // conversation — narrow and auditable, not a blanket "read everything."
  if (n.type === 'coach_contacted_child' && n.target_type === 'conversation') {
    return `/parent/conversation/${n.target_id}`;
  }
  if (n.target_type === 'conversation') return `/feed?conversation=${n.target_id}`;
  if (n.type === 'marketplace_purchase_request') return '/combine';
  if (n.type === 'listing_removed' && n.target_type === 'marketplace_listing') return `/combine/${n.target_id}`;
  if (n.target_type === 'verification_submission') return '/verification-status';
  if (n.target_type === 'parent_athlete_link') {
    // Parent link requests → athlete reviews at /parent/link-requests
    // Parent link outcomes → parent sees their dashboard
    if (n.type === 'parent_link_request') return '/parent/link-requests';
    return '/parent';
  }
  if (n.target_type === 'profile') return actor?.username ? `/profile/${actor.username}` : '/discover';
  if (n.target_type === 'club_invite') {
    // A received invite is reviewed from the Club Invites card on
    // Dashboard. An acceptance notification goes back to whichever staff
    // member sent it — that's more useful landing on the club's own page
    // (to see the new roster member) than on Dashboard, so it needs one
    // lookup first to find which club this invite belongs to.
    if (n.type === 'club_invite_accepted') {
      const { data } = await supabase.from('club_invites').select('organisation_id').eq('id', n.target_id).maybeSingle();
      const orgId = Array.isArray(data) ? data[0]?.organisation_id : data?.organisation_id;
      return orgId ? `/organisation/${orgId}` : '/dashboard';
    }
    return '/dashboard';
  }
  return '/dashboard';
}

export function Navbar() {
  const { isAuthenticated, profile, isAdmin, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [actorsById, setActorsById] = useState<Record<string, Profile>>({});
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;

  // Initial load + batched fetch of actor profiles (one query for every
  // distinct actor in the loaded notifications, not one per notification).
  useEffect(() => {
    if (!profile) return;
    let active = true;

    supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) { console.error('Failed to load notifications:', error.message); return; }
        const loaded = (data as Notification[] | null) ?? [];

        // Enrich stat_verified / stat_rejected notifications with movement text
        // by looking up the most recent rank_history row for the recipient around
        // the notification's created_at timestamp. Single query, no new SQL trigger.
        const statNotifs = loaded.filter(n => n.type === 'stat_verified' || n.type === 'stat_rejected');
        if (statNotifs.length > 0 && profile) {
          const { data: histRows } = await supabase
            .from('rank_history')
            .select('rank_score,previous_rank_score,leaderboard_position,previous_position,trigger_reason,recorded_at')
            .eq('profile_id', profile.id)
            .eq('division', 'Open')
            .in('trigger_reason', ['stat_verified', 'stat_unverified'])
            .order('recorded_at', { ascending: false })
            .limit(20);

          if (histRows) {
            const enriched = loaded.map(n => {
              if (n.type !== 'stat_verified' && n.type !== 'stat_rejected') return n;
              // Find closest history row recorded after the notification
              const notifTime = new Date(n.created_at).getTime();
              const match = (histRows as {
                rank_score: number | null; previous_rank_score: number | null;
                leaderboard_position: number | null; previous_position: number | null;
                trigger_reason: string; recorded_at: string;
              }[]).find(h => {
                const diff = new Date(h.recorded_at).getTime() - notifTime;
                return diff > -60000 && diff < 120000; // within ±1 min
              });
              if (!match) return n;
              const h = match;
              const newlyRanked    = h.previous_rank_score == null && h.rank_score != null;
              const becameUnranked = h.previous_rank_score != null && h.rank_score == null;
              const scoreDelta = h.rank_score != null && h.previous_rank_score != null
                ? Math.round((Number(h.rank_score) - Number(h.previous_rank_score)) * 100) / 100 : null;
              let text = '';
              if (n.type === 'stat_verified') {
                if (newlyRanked) {
                  text = `Your stat was verified. You earned your first ScoutRank: ${Number(h.rank_score).toFixed(2)}.`;
                } else if (h.leaderboard_position != null && scoreDelta != null) {
                  text = `Your stat was verified. ScoutRank ${scoreDelta >= 0 ? 'increased by' : 'decreased by'} ${Math.abs(scoreDelta).toFixed(2)} — now at #${h.leaderboard_position}.`;
                } else if (scoreDelta != null) {
                  text = `Your stat was verified. ScoutRank ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(2)}.`;
                } else {
                  text = 'Your stat was verified — your ScoutRank score has been updated.';
                }
              } else {
                if (becameUnranked) {
                  text = 'Your stat was not verified. You are now unranked in this sport.';
                } else if (scoreDelta != null) {
                  text = `Your stat was not verified. ScoutRank decreased by ${Math.abs(scoreDelta).toFixed(2)}.`;
                } else {
                  text = 'Your stat submission was not verified.';
                }
              }
              return { ...n, metadata: { ...((n as unknown as Record<string, unknown>).metadata as object ?? {}), movement_text: text } };
            });
            if (!active) return;
            setNotifications(enriched as Notification[]);
          } else {
            if (!active) return;
            setNotifications(loaded);
          }
        } else {
          setNotifications(loaded);
        }

        const actorIds = [...new Set(loaded.map(n => n.actor_id).filter((id): id is string => !!id))];
        if (actorIds.length > 0) {
          const { data: actors, error: actorsError } = await supabase.from('profiles').select('*').in('id', actorIds);
          if (actorsError) { console.error('Failed to load notification actors:', actorsError.message); return; }
          if (!active) return;
          const map: Record<string, Profile> = {};
          for (const a of (actors as Profile[] | null) ?? []) map[a.id] = a;
          setActorsById(map);
        }
      });

    return () => { active = false; };
  }, [profile?.id]);

  // Realtime — new notifications appear live without a refresh.
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`,
      }, async (payload) => {
        const newNotif = payload.new as Notification;
        setNotifications(prev => prev.some(n => n.id === newNotif.id) ? prev : [newNotif, ...prev]);
        if (newNotif.actor_id) {
          setActorsById(prev => {
            if (prev[newNotif.actor_id as string]) return prev;
            supabase.from('profiles').select('*').eq('id', newNotif.actor_id).maybeSingle()
              .then(({ data: actor, error }) => {
                if (error) { console.error('Failed to load notification actor:', error.message); return; }
                if (actor) setActorsById(p => ({ ...p, [actor.id]: actor as Profile }));
              });
            return prev;
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Club/org owners land on their organisation page on login (see
  // App.tsx's authenticatedDest), but until now had no way back to it
  // from anywhere else in the app — the main nav was the same
  // athlete/coach set for everyone. "My Club" gives them a permanent way
  // back to their own org page regardless of what page they're on.
  const navLinks = profile?.role === 'parent'
    ? [
        { to: '/discover', label: 'Discover', icon: Search },
        { to: '/parent', label: 'My Athletes', icon: Users },
      ]
    : [
        { to: '/feed', label: 'Feed', icon: TrendingUp },
        { to: '/explore', label: 'Explore', icon: Compass },
        { to: '/rankings', label: 'Rankings', icon: BarChart3 },
        { to: '/discover', label: 'Discover', icon: Search },
        { to: '/combine', label: 'Combine', icon: ShoppingBag },
        { to: '/scout-bot', label: 'Scout Bot', icon: Bot },
        ...(profile?.owned_organisation_id
          ? [{ to: `/organisation/${profile.owned_organisation_id}`, label: 'My Club', icon: Building2 }]
          : []),
      ];

  const handleNotifClick = async (n: Notification) => {
    setNotifOpen(false);
    if (!n.read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', n.id);
      if (error) console.error('Failed to mark notification read:', error.message);
    }
    const actor = n.actor_id ? actorsById[n.actor_id] : undefined;
    const route = await resolveNotificationRoute(n, actor);
    navigate(route);
  };

  // "Mark all as read" — a real bulk UPDATE, not a delete. Notifications
  // stay in the list and remain clickable exactly as before; this only
  // clears the unread state (and therefore the badge), the same as
  // clicking each one individually would, just all at once.
  const handleMarkAllRead = async () => {
    if (!profile || unreadCount === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', profile.id)
      .eq('read', false);
    if (error) console.error('Failed to mark all notifications read:', error.message);
  };

  return (
    <>
    <nav className="sticky top-0 z-50 bg-sr-bg/90 backdrop-blur-xl border-b border-sr-border">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex-shrink-0">
          <Logo size="sm" withText={true} />
        </Link>

        {isAuthenticated && (
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map(link => (
              <Link key={link.to} to={link.to}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors">
                <link.icon className="h-4 w-4" />{link.label}
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <button onClick={() => navigate('/discover')}
                className="hidden lg:flex items-center gap-2 px-3 py-2 text-sm text-sr-text-muted bg-sr-surface border border-sr-border rounded-lg hover:border-sr-purple/50 transition-colors">
                <Search className="h-4 w-4" />
                <span className="w-32 text-left">Search athletes...</span>
              </button>

              {/* Notifications */}
              <div ref={notifRef} className="relative">
                <button onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
                  className="relative p-2 text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-sr-purple text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-80 bg-sr-surface border border-sr-border rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="p-3 border-b border-sr-border flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Notifications</span>
                      {unreadCount > 0 ? (
                        <button onClick={handleMarkAllRead} className="text-xs text-sr-purple-light hover:text-sr-purple transition-colors">
                          Mark all as read
                        </button>
                      ) : (
                        <span className="text-xs text-sr-text-muted">All caught up</span>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-sr-text-muted">No notifications yet</div>
                      ) : (
                        notifications.map(n => {
                          const actor = n.actor_id ? actorsById[n.actor_id] : undefined;
                          const actorName = actor ? fullName(actor) : 'Someone';
                          const { Icon, text } = describeNotification(n, actorName);
                          return (
                            <button key={n.id} onClick={() => handleNotifClick(n)}
                              className={`w-full text-left p-3 hover:bg-sr-surface-light transition-colors border-b border-sr-border/50 ${!n.read ? 'bg-sr-purple/5' : ''}`}>
                              <div className="flex items-start gap-2">
                                {!n.read && <span className="h-2 w-2 rounded-full bg-sr-purple mt-1.5 flex-shrink-0" />}
                                <div className="flex items-start gap-2.5">
                                  <div className="h-7 w-7 rounded-lg bg-sr-purple/10 flex items-center justify-center flex-shrink-0">
                                    <Icon className="h-3.5 w-3.5 text-sr-purple-light" />
                                  </div>
                                  <div>
                                    <p className="text-sm text-white">{text}</p>
                                    <p className="text-[10px] text-sr-text-muted mt-1">{timeAgo(n.created_at)}</p>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Profile */}
              <div ref={profileRef} className="relative">
                <button onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
                  className="hidden lg:flex items-center gap-2 p-1 hover:bg-sr-surface-light rounded-full transition-colors">
                  <div className="h-8 w-8 rounded-full overflow-hidden flex-shrink-0 avatar-ring">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xs font-bold rounded-full">
                        {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                      </div>
                    )}
                  </div>
                </button>
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-sr-surface border border-sr-border rounded-xl shadow-2xl overflow-hidden">
                    <div className="p-3 border-b border-sr-border">
                      <p className="text-sm font-semibold text-white">{fullName(profile)}</p>
                      <p className="text-xs text-sr-text-muted">@{profile?.username}</p>
                    </div>
                    <div className="p-1">
                      {[
                        // Club-owning accounts don't get a separate "My Profile" —
                        // their club page IS their profile now, so "My Club" below
                        // covers it and we don't show two links to the same place.
                        { icon: User, label: 'My Profile', to: `/profile/${profile?.username}`, show: !profile?.owned_organisation_id },
                        { icon: Building2, label: 'My Club', to: `/organisation/${profile?.owned_organisation_id}`, show: !!profile?.owned_organisation_id },
                        { icon: BarChart3, label: 'Dashboard', to: '/dashboard', show: profile?.role !== 'parent' },
                        { icon: Users, label: 'Parent Access', to: '/parent/link-requests', show: profile?.role === 'athlete' },
                        // Club-owner accounts are 'coach'-role under the hood, but
                        // their club was already vetted on approval — personal
                        // coach/scout verification doesn't apply to them.
                        { icon: Shield, label: 'Verification', to: '/verification-status', show: (profile?.role === 'coach' || profile?.role === 'scout') && !profile?.owned_organisation_id },
                        { icon: Settings, label: 'Settings', to: '/settings', show: true },
                        { icon: Shield, label: 'Admin', to: '/admin', show: isAdmin },
                      ].filter(item => item.show).map((item) => {
                        const Icon = item.icon;
                        return (
                          <button key={item.label} onClick={() => { setProfileOpen(false); navigate(item.to); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors">
                            <Icon className="h-4 w-4" />{item.label}
                          </button>
                        );
                      })}
                      <hr className="border-sr-border my-1" />
                      <button onClick={() => { setProfileOpen(false); logout(); navigate('/'); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <LogOut className="h-4 w-4" />Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Log In</Button>
              <Button variant="brand" size="sm" onClick={() => navigate('/signup')}>Sign Up</Button>
            </div>
          )}
        </div>
      </div>
    </nav>

      {isAuthenticated && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-sr-surface/95 backdrop-blur-xl border-t border-sr-border"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center justify-around px-0.5 py-1.5">
            {(profile?.role === 'parent'
              ? [
                  { to: '/dashboard', label: 'Home', icon: BarChart3 },
                  { to: '/discover', label: 'Discover', icon: Search },
                  { to: '/parent', label: 'Athletes', icon: Users },
                  { to: `/profile/${profile?.username}`, label: 'Profile', icon: User },
                ]
              : [
                  { to: '/feed', label: 'Feed', icon: TrendingUp },
                  { to: '/explore', label: 'Explore', icon: Compass },
                  { to: '/rankings', label: 'Rankings', icon: Trophy },
                  { to: '/combine', label: 'Combine', icon: ShoppingBag },
                  { to: '/scout-bot', label: 'Scout Bot', icon: Bot },
                  // Club-owning accounts land on their club page here too —
                  // same reasoning as the desktop dropdown above.
                  profile?.owned_organisation_id
                    ? { to: `/organisation/${profile.owned_organisation_id}`, label: 'Club', icon: Building2 }
                    : { to: `/profile/${profile?.username}`, label: 'Profile', icon: User },
                ]
            ).map(link => (
              <Link key={link.to} to={link.to}
                className="flex flex-col items-center justify-center min-w-[40px] flex-1 py-1.5 text-sr-text-muted hover:text-white active:text-sr-purple-light transition-colors">
                <link.icon className="h-[20px] w-[20px]" />
                <span className="text-[8px] font-medium mt-0.5 leading-tight whitespace-nowrap">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
