// Athlete-side page: review and approve/reject incoming parent link requests.
// Accessible to any authenticated user but only meaningful for athletes.
// Route: /parent/link-requests (accessible via notification deep-link).
import { useState, useEffect } from 'react';
import { shortDate } from '@/utils/time';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import type { Profile, ParentAthleteLink } from '@/lib/supabase';
import { Button } from '@/components/ui/BrandButton';
import { Users, Check, X, Clock, Loader2, AlertCircle, ArrowLeft, Shield } from 'lucide-react';

interface LinkRequest {
  link: ParentAthleteLink;
  parent: Profile;
}

export default function ParentLinkRequestsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    if (!profile) return;
    setIsLoading(true);
    const { data: links, error: linksError } = await supabase
      .from('parent_athlete_links')
      .select('*')
      .eq('athlete_profile_id', profile.id)
      .order('created_at', { ascending: false });
    if (linksError) { console.error('[parent-link-requests] load error:', linksError.message); setIsLoading(false); return; }
    if (!links || links.length === 0) { setIsLoading(false); return; }

    const parentIds = [...new Set((links as ParentAthleteLink[]).map(l => l.parent_profile_id))];
    const { data: parents } = await supabase.from('profiles').select('*').in('id', parentIds);
    const parentMap: Record<string, Profile> = {};
    for (const p of (parents as Profile[] | null) ?? []) parentMap[p.id] = p;

    setRequests(
      (links as ParentAthleteLink[])
        .filter(l => parentMap[l.parent_profile_id])
        .map(l => ({ link: l, parent: parentMap[l.parent_profile_id] }))
    );
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  const action = async (linkId: string, newStatus: 'approved' | 'rejected' | 'revoked') => {
    setActioning(linkId);
    setError('');
    const { error: updateError } = await supabase
      .from('parent_athlete_links')
      .update({ status: newStatus })
      .eq('id', linkId);
    setActioning(null);
    if (updateError) {
      console.error('[parent-link-requests] action error:', updateError.message);
      setError(updateError.message);
      return;
    }
    load();
  };

  const pending = requests.filter(r => r.link.status === 'pending');
  const approved = requests.filter(r => r.link.status === 'approved');
  const others = requests.filter(r => !['pending','approved'].includes(r.link.status));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-sr-text-muted hover:text-white hover:bg-sr-surface-light transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center">
          <Users className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Parent Access</h1>
          <p className="text-sm text-sr-text-muted">Review parent account requests for your profile</p>
        </div>
      </div>

      <div className="card-premium p-4 mb-6 flex items-start gap-3">
        <Shield className="h-5 w-5 text-sr-purple-light flex-shrink-0 mt-0.5" />
        <p className="text-sm text-sr-text-muted">
          Approved parents can view your profile, posts, achievements and stats.
          They cannot edit your profile, post as you, or send messages on your behalf.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Users className="h-10 w-10 mx-auto text-sr-text-muted mb-3" />
          <p className="text-white font-semibold mb-1">No Parent Requests</p>
          <p className="text-sm text-sr-text-muted">You haven't received any parent link requests yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-sr-silver mb-3">Pending Requests</h2>
              <div className="space-y-3">
                {pending.map(({ link, parent }) => (
                  <div key={link.id} className="card-premium p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-xl overflow-hidden flex-shrink-0">
                        {parent.avatar_url
                          ? <img src={parent.avatar_url} alt="" className="h-full w-full object-cover" />
                          : <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xs font-bold">{parent.first_name?.[0]}{parent.last_name?.[0]}</div>
                        }
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{fullName(parent)}</p>
                        <p className="text-xs text-sr-text-muted">@{parent.username} · Requested {shortDate(link.created_at)}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 flex items-center gap-1">
                        <Clock className="h-3 w-3" />Pending
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="brand" size="sm" disabled={actioning === link.id} onClick={() => action(link.id, 'approved')}
                        icon={actioning === link.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}>
                        Approve
                      </Button>
                      <Button variant="danger" size="sm" disabled={!!actioning} onClick={() => action(link.id, 'rejected')}
                        icon={<X className="h-3.5 w-3.5" />}>
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {approved.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-sr-silver mb-3">Approved Parents</h2>
              <div className="space-y-3">
                {approved.map(({ link, parent }) => (
                  <div key={link.id} className="card-premium p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg overflow-hidden flex-shrink-0">
                      {parent.avatar_url
                        ? <img src={parent.avatar_url} alt="" className="h-full w-full object-cover" />
                        : <div className="h-full w-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-white text-xs font-bold">{parent.first_name?.[0]}{parent.last_name?.[0]}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{fullName(parent)}</p>
                      <p className="text-xs text-sr-text-muted">
                        Approved {shortDate(link.athlete_approved_at ?? link.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">Approved</span>
                      <button disabled={!!actioning} onClick={() => action(link.id, 'revoked')}
                        className="text-xs text-sr-text-muted hover:text-red-400 transition-colors disabled:opacity-50">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-sr-silver mb-3">Past Requests</h2>
              <div className="space-y-2">
                {others.map(({ link, parent }) => (
                  <div key={link.id} className="card-premium p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-sr-text-muted truncate">{fullName(parent)}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-sr-surface text-sr-text-muted border border-sr-border capitalize">{link.status}</span>
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
