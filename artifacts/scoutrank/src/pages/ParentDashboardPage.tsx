import { useState, useEffect, useMemo } from 'react';
import { shortDate } from '@/utils/time';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import type { Profile, ParentAthleteLink } from '@/lib/supabase';
import { Button } from '@/components/ui/BrandButton';
import { SafeProfileLink } from '@/components/ui/SafeProfileLink';
import {
  Users, Search, Check, X, Clock, Shield, Plus,
  Loader2, AlertCircle, ChevronRight, Trophy, Star, User, Settings,
} from 'lucide-react';

interface LinkedAthlete {
  link: ParentAthleteLink;
  athlete: Profile;
}

export default function ParentDashboardPage() {
  const { profile, user } = useAuth();
  const [linkedAthletes, setLinkedAthletes] = useState<LinkedAthlete[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Link request state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const loadLinks = async () => {
    if (!profile) return;
    setIsLoading(true);
    const { data: links, error } = await supabase
      .from('parent_athlete_links')
      .select('*')
      .eq('parent_profile_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('[parent-dashboard] load links error:', error.message); setIsLoading(false); return; }
    if (!links || links.length === 0) { setIsLoading(false); return; }

    const athleteIds = [...new Set((links as ParentAthleteLink[]).map(l => l.athlete_profile_id))];
    const { data: athletes, error: athError } = await supabase
      .from('profiles').select('*').in('id', athleteIds);
    if (athError) console.error('[parent-dashboard] load athletes error:', athError.message);

    const athleteMap: Record<string, Profile> = {};
    for (const a of (athletes as Profile[] | null) ?? []) athleteMap[a.id] = a;

    setLinkedAthletes(
      (links as ParentAthleteLink[])
        .filter(l => athleteMap[l.athlete_profile_id])
        .map(l => ({ link: l, athlete: athleteMap[l.athlete_profile_id] }))
    );
    setIsLoading(false);
  };

  useEffect(() => { loadLinks(); }, [profile?.id]);

  const searchAthletes = async (q: string) => {
    setSearchQuery(q);
    setRequestError('');
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, first_name, last_name, avatar_url, role, date_of_birth, age')
      .eq('role', 'athlete')
      .ilike('username', `%${q.trim()}%`)
      .limit(6);
    setIsSearching(false);
    if (error) { console.error('[parent-dashboard] search error:', error.message); return; }
    setSearchResults((data as Profile[] | null) ?? []);
  };

  const sendLinkRequest = async (athleteId: string, athleteUsername: string) => {
    if (!profile || requesting) return;
    setRequesting(athleteId);
    setRequestError('');
    const { error } = await supabase.from('parent_athlete_links').insert({
      parent_profile_id: profile.id,
      athlete_profile_id: athleteId,
    });
    setRequesting(null);
    if (error) {
      setRequestError(error.message);
      return;
    }
    setRequestSuccess(`Request sent to @${athleteUsername}. They'll receive a notification to approve.`);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
    loadLinks();
  };

  const revokeLink = async (linkId: string) => {
    const { error } = await supabase
      .from('parent_athlete_links')
      .update({ status: 'revoked' })
      .eq('id', linkId);
    if (error) { console.error('[parent-dashboard] revoke error:', error.message); return; }
    loadLinks();
  };

  const pending = linkedAthletes.filter(l => l.link.status === 'pending');
  const approved = linkedAthletes.filter(l => l.link.status === 'approved');
  const others = linkedAthletes.filter(l => !['pending','approved'].includes(l.link.status));

  const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending Approval', className: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
    approved: { label: 'Linked', className: 'bg-green-400/10 text-green-400 border-green-400/20' },
    rejected: { label: 'Rejected', className: 'bg-red-400/10 text-red-400 border-red-400/20' },
    revoked: { label: 'Revoked', className: 'bg-sr-surface text-sr-text-muted border-sr-border' },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Parent Dashboard</h1>
            <p className="text-sm text-sr-text-muted">Monitor your linked athletes</p>
          </div>
        </div>
        <Button variant="brand" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setShowSearch(true); setRequestSuccess(''); setRequestError(''); }}>
          Link Athlete
        </Button>
      </div>

      {/* Link request form */}
      {showSearch && (
        <div className="card-premium p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Link an Athlete</h2>
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); setRequestError(''); }}>
              <X className="h-4 w-4 text-sr-text-muted hover:text-white" />
            </button>
          </div>
          <p className="text-xs text-sr-text-muted mb-3">
            Search by the athlete's username. They must be under 18 and must approve the request.
          </p>
          {requestError && (
            <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{requestError}
            </div>
          )}
          <div className="relative">
            {/* Inner wrapper scoped to input height so icon top-1/2 doesn't
                drift when the results list renders below */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted pointer-events-none z-10" />
              <input className="input-dark text-sm pr-9" placeholder="Search by username..."
                style={{ paddingLeft: '2.5rem' }}
                value={searchQuery} onChange={e => searchAthletes(e.target.value)} />
              {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted animate-spin pointer-events-none" />}
            </div>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {searchResults.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-sr-surface-light transition-colors">
                  <div className="h-8 w-8 rounded-lg overflow-hidden flex-shrink-0">
                    {a.avatar_url
                      ? <img src={a.avatar_url} alt="" className="h-full w-full object-cover" />
                      : <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xs font-bold">{a.first_name?.[0]}{a.last_name?.[0]}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{fullName(a)}</p>
                    <p className="text-xs text-sr-text-muted">@{a.username}</p>
                  </div>
                  <Button variant="brand" size="sm" disabled={requesting === a.id}
                    icon={requesting === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
                    onClick={() => sendLinkRequest(a.id, a.username)}>
                    Request
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {requestSuccess && (
        <div className="mb-6 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
          <Check className="h-4 w-4 flex-shrink-0" />{requestSuccess}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <button onClick={() => { setShowSearch(true); setRequestSuccess(''); setRequestError(''); }}
          className="card-premium p-4 text-center hover:border-sr-purple/30 transition-colors group">
          <Plus className="h-5 w-5 mx-auto text-sr-text-muted group-hover:text-sr-purple-light mb-1.5 transition-colors" />
          <p className="text-xs font-medium text-sr-silver group-hover:text-white transition-colors">Link Athlete</p>
        </button>
        <Link to={`/profile/${profile?.username}`} className="card-premium p-4 text-center hover:border-sr-purple/30 transition-colors group">
          <User className="h-5 w-5 mx-auto text-sr-text-muted group-hover:text-sr-purple-light mb-1.5 transition-colors" />
          <p className="text-xs font-medium text-sr-silver group-hover:text-white transition-colors">My Profile</p>
        </Link>
        <Link to="/settings" className="card-premium p-4 text-center hover:border-sr-purple/30 transition-colors group">
          <Settings className="h-5 w-5 mx-auto text-sr-text-muted group-hover:text-sr-purple-light mb-1.5 transition-colors" />
          <p className="text-xs font-medium text-sr-silver group-hover:text-white transition-colors">Settings</p>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : linkedAthletes.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Athletes Linked</h3>
          <p className="text-sm text-sr-text-muted mb-4">
            Link your child's athlete account to monitor their profile, achievements and stats.
          </p>
          <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => setShowSearch(true)}>
            Link Your First Athlete
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Approved links */}
          {approved.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-sr-silver mb-3">Linked Athletes</h2>
              <div className="space-y-3">
                {approved.map(({ link, athlete }) => (
                  <div key={link.id} className="card-premium p-5">
                    <div className="flex items-center gap-3">
                      <Link to={`/profile/${athlete.username}`} className="h-12 w-12 rounded-xl overflow-hidden flex-shrink-0">
                        {athlete.avatar_url
                          ? <img src={athlete.avatar_url} alt="" className="h-full w-full object-cover" />
                          : <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-sm font-bold">{athlete.first_name?.[0]}{athlete.last_name?.[0]}</div>
                        }
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link to={`/profile/${athlete.username}`} className="text-sm font-semibold text-white hover:text-sr-purple-light transition-colors">
                          {fullName(athlete)}
                        </Link>
                        <p className="text-xs text-sr-text-muted">@{athlete.username}</p>
                        <p className="text-xs text-sr-text-muted mt-0.5">
                          Linked {shortDate(link.athlete_approved_at ?? link.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE.approved.className}`}>
                          {STATUS_BADGE.approved.label}
                        </span>
                        <Link to={`/profile/${athlete.username}`}
                          className="p-1.5 rounded-lg text-sr-text-muted hover:text-white hover:bg-sr-surface-light transition-colors">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                    {/* Quick stats row */}
                    <div className="mt-3 pt-3 border-t border-sr-border flex gap-4">
                      <Link to={`/profile/${athlete.username}?tab=achievements`} className="flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors">
                        <Trophy className="h-3.5 w-3.5" /> Achievements
                      </Link>
                      <Link to={`/profile/${athlete.username}?tab=stats`} className="flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors">
                        <Star className="h-3.5 w-3.5" /> Stats
                      </Link>
                      <button onClick={() => revokeLink(link.id)}
                        className="ml-auto text-xs text-sr-text-muted hover:text-red-400 transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-sr-silver mb-3">Pending Approval</h2>
              <div className="space-y-3">
                {pending.map(({ link, athlete }) => (
                  <div key={link.id} className="card-premium p-5 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl overflow-hidden flex-shrink-0">
                      {athlete.avatar_url
                        ? <img src={athlete.avatar_url} alt="" className="h-full w-full object-cover" />
                        : <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xs font-bold">{athlete.first_name?.[0]}{athlete.last_name?.[0]}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{fullName(athlete)}</p>
                      <p className="text-xs text-sr-text-muted">@{athlete.username} · Requested {shortDate(link.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE.pending.className}`}>
                        <Clock className="inline h-3 w-3 mr-1" />Pending
                      </span>
                      <button onClick={() => revokeLink(link.id)}
                        className="text-xs text-sr-text-muted hover:text-red-400 transition-colors">Cancel</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rejected / revoked */}
          {others.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-sr-silver mb-3">Past Requests</h2>
              <div className="space-y-2">
                {others.map(({ link, athlete }) => (
                  <div key={link.id} className="card-premium p-4 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg overflow-hidden flex-shrink-0">
                      {athlete.avatar_url
                        ? <img src={athlete.avatar_url} alt="" className="h-full w-full object-cover" />
                        : <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xs font-bold">{athlete.first_name?.[0]}{athlete.last_name?.[0]}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{fullName(athlete)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[link.status]?.className ?? ''}`}>
                      {STATUS_BADGE[link.status]?.label ?? link.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
