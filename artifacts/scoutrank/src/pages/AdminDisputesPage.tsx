import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { scoreVerifiedStat } from '@/lib/aiScoring';
import { resolveStatEvidenceUrl } from '@/lib/statEvidence';
import { timeAgo } from '@/utils/time';
import { Gavel, Loader2, AlertCircle, Check, X, ExternalLink, ShieldOff } from 'lucide-react';
import { AdminTopNav } from '@/components/layout/AdminTopNav';

interface DisputeRow {
  id: string;
  stat_id: string;
  profile_id: string;
  ai_reasoning: string;
  status: 'open' | 'resolved';
  resolution: 'approved' | 'rejected' | null;
  created_at: string;
  athlete_stats: {
    value: number;
    competition_level: string | null;
    evidence_url: string | null;
    evidence_description: string | null;
    custom_sport: string | null;
    custom_event_name: string | null;
    custom_unit: string | null;
    stat_event_types: { sport: string; label: string; unit: string } | null;
  } | null;
  profiles: { username: string; first_name: string; last_name: string } | null;
}

interface AccountDisputeRow {
  id: string;
  profile_id: string;
  moderation_log_id: string;
  message: string | null;
  status: 'open' | 'resolved';
  resolution: 'upheld' | 'overturned' | null;
  created_at: string;
  profiles: { username: string; first_name: string; last_name: string } | null;
  account_moderation_log: {
    action: string; reason: string | null; evidence_url: string | null; suspended_until: string | null; performed_by: string | null;
  } | null;
}

/**
 * Human review queue covering two different kinds of disputes:
 *  - Stat evidence the AI declined to auto-approve.
 *  - A person disputing their own suspension/ban.
 * Both and super_admin can review, but for account disputes specifically:
 * the admin who issued the original suspension/ban can NEVER resolve the
 * dispute against their own action — it has to be a different admin, or
 * any super_admin (super_admins are the one exception and can review
 * disputes on their own actions too).
 */
export default function AdminDisputesPage() {
  const { isAdmin, isSuperAdmin, profile: currentAdmin } = useAuth();
  const [category, setCategory] = useState<'stats' | 'accounts'>('stats');
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [accountDisputes, setAccountDisputes] = useState<AccountDisputeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [search, setSearch] = useState('');

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;
  }

  // Resolves a fresh signed URL on click rather than baking one into a
  // stored href — signed URLs expire, so one generated at row-render time
  // could easily be stale by the time an admin actually clicks it.
  const openStatEvidence = async (evidenceUrl: string) => {
    const url = await resolveStatEvidenceUrl(evidenceUrl);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const load = async () => {
    setIsLoading(true);
    setError('');
    if (category === 'stats') {
      let q = supabase
        .from('stat_disputes')
        .select(`
          id, stat_id, profile_id, ai_reasoning, status, resolution, created_at,
          athlete_stats:stat_id(value, competition_level, evidence_url, evidence_description, custom_sport, custom_event_name, custom_unit, stat_event_types(sport, label, unit)),
          profiles:profile_id(username, first_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error: qErr } = await q;
      if (qErr) { setError(qErr.message); setIsLoading(false); return; }
      setDisputes((data as unknown as DisputeRow[]) ?? []);
    } else {
      let q = supabase
        .from('account_disputes')
        .select(`
          id, profile_id, moderation_log_id, message, status, resolution, created_at,
          profiles:profile_id(username, first_name, last_name),
          account_moderation_log:moderation_log_id(action, reason, evidence_url, suspended_until, performed_by)
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error: qErr } = await q;
      if (qErr) { setError(qErr.message); setIsLoading(false); return; }
      setAccountDisputes((data as unknown as AccountDisputeRow[]) ?? []);
    }
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter, category]);

  const resolveAccountDispute = async (dispute: AccountDisputeRow, decision: 'upheld' | 'overturned') => {
    if (!currentAdmin) return;
    setActioning(dispute.id);
    setError('');

    if (decision === 'overturned') {
      const { error: releaseErr } = await supabase.from('profiles').update({
        account_status: 'active', status_reason: null, suspended_until: null, status_changed_by: null, status_changed_at: null, status_evidence_url: null, restricted_until: null,
      }).eq('id', dispute.profile_id);
      if (releaseErr) { setError(`Failed to lift restriction: ${releaseErr.message}`); setActioning(null); return; }
      await supabase.from('account_moderation_log').insert({
        profile_id: dispute.profile_id, action: 'released', reason: null, suspended_until: null, performed_by: currentAdmin.id,
      });
    }

    const { error: disputeErr } = await supabase
      .from('account_disputes')
      .update({ status: 'resolved', resolution: decision, resolved_by: currentAdmin.id, resolved_at: new Date().toISOString() })
      .eq('id', dispute.id);
    setActioning(null);
    if (disputeErr) { setError(`${decision === 'overturned' ? 'Lifted the restriction, but' : ''} Failed to close the dispute: ${disputeErr.message}`); return; }

    setAccountDisputes(prev => prev.map(d => d.id === dispute.id ? { ...d, status: 'resolved', resolution: decision } : d));
  };

  const resolveDispute = async (dispute: DisputeRow, decision: 'approved' | 'rejected') => {
    setActioning(dispute.id);
    setError('');

    if (decision === 'approved') {
      const { error: verifyErr } = await supabase
        .from('athlete_stats')
        .update({ verification_status: 'verified', rejection_reason: null })
        .eq('id', dispute.stat_id);
      if (verifyErr) { setError(`Failed to verify stat: ${verifyErr.message}`); setActioning(null); return; }

      // Same AI numeric scoring the automated path uses — a human
      // overriding the evidence decision still gets a real, comparable
      // score, not a placeholder.
      const scoreResult = await scoreVerifiedStat(dispute.stat_id);
      if (!scoreResult.ok) {
        setError(`Stat verified, but scoring failed: ${scoreResult.error}`);
      }
    } else {
      const { error: rejectErr } = await supabase
        .from('athlete_stats')
        .update({ verification_status: 'rejected' })
        .eq('id', dispute.stat_id);
      if (rejectErr) { setError(`Failed to reject stat: ${rejectErr.message}`); setActioning(null); return; }
    }

    const { error: disputeErr } = await supabase
      .from('stat_disputes')
      .update({ status: 'resolved', resolution: decision, resolved_at: new Date().toISOString() })
      .eq('id', dispute.id);
    setActioning(null);
    if (disputeErr) { setError(`Resolved the stat, but failed to close the dispute: ${disputeErr.message}`); return; }

    setDisputes(prev => prev.map(d => d.id === dispute.id ? { ...d, status: 'resolved', resolution: decision } : d));
  };

  return (
    <div className="min-h-screen bg-sr-bg">
      <AdminTopNav />
      <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Gavel className="h-7 w-7 text-sr-purple" />
        <h1 className="text-2xl font-bold text-white">Disputes</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">
          {(category === 'stats' ? disputes : accountDisputes).length} shown
        </span>
      </div>

      <div className="flex gap-2 mb-4">
        {([['stats', 'Stat Evidence'], ['accounts', 'Account Restrictions']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setCategory(id)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              category === id ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <p className="text-sm text-sr-text-muted mb-6">
        {category === 'stats'
          ? 'Stats the AI declined to auto-approve. A person makes the final call here — approving verifies the stat and runs the same AI scoring the automated path uses; rejecting leaves it rejected.'
          : 'People disputing their own suspension/ban. The admin who issued the original restriction can\'t resolve its dispute — only a different admin, or any super_admin, can.'}
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex gap-2">
          {(['open', 'resolved', 'all'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors ${
                statusFilter === s ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
              }`}>
              {s}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or username..."
          className="input-dark !w-56 text-xs py-1.5" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : category === 'stats' ? (
        disputes.filter(d => !search || `${d.profiles?.first_name} ${d.profiles?.last_name} ${d.profiles?.username}`.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
          <div className="card-premium p-12 text-center">
            <Gavel className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
            <p className="text-white font-semibold mb-1">No {statusFilter === 'all' ? '' : statusFilter} disputes</p>
            <p className="text-sm text-sr-text-muted">Nothing needs human review right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {disputes.filter(d => !search || `${d.profiles?.first_name} ${d.profiles?.last_name} ${d.profiles?.username}`.toLowerCase().includes(search.toLowerCase())).map(d => {
              const stat = d.athlete_stats;
              const sport = stat?.stat_event_types?.sport ?? stat?.custom_sport ?? 'unknown';
              const eventLabel = stat?.stat_event_types?.label ?? stat?.custom_event_name ?? 'custom event';
              const unit = stat?.stat_event_types?.unit ?? stat?.custom_unit ?? '';
              return (
                <div key={d.id} className="card-premium p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                          d.status === 'open' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                          d.resolution === 'approved' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                          'text-red-400 bg-red-400/10 border-red-400/20'
                        }`}>
                          {d.status === 'open' ? 'Open' : `Resolved — ${d.resolution}`}
                        </span>
                        <span className="text-xs text-sr-text-muted">{timeAgo(d.created_at)}</span>
                      </div>
                      <p className="text-sm font-semibold text-white">
                        {stat ? `${stat.value} ${unit} — ${eventLabel} (${sport})` : 'Stat details unavailable'}
                      </p>
                      {d.profiles && (
                        <Link to={`/profile/${d.profiles.username}`} className="text-xs text-sr-purple-light hover:text-white transition-colors">
                          {fullName(d.profiles)} (@{d.profiles.username})
                        </Link>
                      )}
                    </div>
                    {d.status === 'open' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => resolveDispute(d, 'rejected')} disabled={actioning === d.id}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                          {actioning === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Reject
                        </button>
                        <button onClick={() => resolveDispute(d, 'approved')} disabled={actioning === d.id}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                          {actioning === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="bg-sr-surface rounded-lg p-3 mb-3">
                    <p className="text-[10px] text-sr-text-muted uppercase tracking-wide mb-1">Why the AI declined</p>
                    <p className="text-sm text-sr-silver">{d.ai_reasoning}</p>
                  </div>

                  {stat?.evidence_description && (
                    <div className="mb-3">
                      <p className="text-[10px] text-sr-text-muted uppercase tracking-wide mb-1">Athlete's description</p>
                      <p className="text-sm text-sr-silver">{stat.evidence_description}</p>
                    </div>
                  )}

                  {stat?.evidence_url && (
                    <button onClick={() => openStatEvidence(stat.evidence_url!)}
                      className="inline-flex items-center gap-1.5 text-xs text-sr-purple-light hover:text-white transition-colors">
                      View evidence <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        accountDisputes.filter(d => !search || `${d.profiles?.first_name} ${d.profiles?.last_name} ${d.profiles?.username}`.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
          <div className="card-premium p-12 text-center">
            <ShieldOff className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
            <p className="text-white font-semibold mb-1">No {statusFilter === 'all' ? '' : statusFilter} account disputes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accountDisputes.filter(d => !search || `${d.profiles?.first_name} ${d.profiles?.last_name} ${d.profiles?.username}`.toLowerCase().includes(search.toLowerCase())).map(d => {
              const log = d.account_moderation_log;
              // The core rule: whoever issued this restriction can't be
              // the one to resolve its dispute — unless they're a
              // super_admin, who is exempt from that restriction.
              const isOwnAction = log?.performed_by === currentAdmin?.id;
              const canResolve = !isOwnAction || isSuperAdmin;
              return (
                <div key={d.id} className="card-premium p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                          d.status === 'open' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                          d.resolution === 'overturned' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                          'text-red-400 bg-red-400/10 border-red-400/20'
                        }`}>
                          {d.status === 'open' ? 'Open' : `Resolved — ${d.resolution}`}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-sr-border text-sr-text-muted uppercase">{log?.action}</span>
                        <span className="text-xs text-sr-text-muted">{timeAgo(d.created_at)}</span>
                      </div>
                      {d.profiles && (
                        <Link to={`/profile/${d.profiles.username}`} className="text-sm font-semibold text-white hover:text-sr-purple-light transition-colors">
                          {fullName(d.profiles)} (@{d.profiles.username})
                        </Link>
                      )}
                    </div>
                    {d.status === 'open' && (
                      canResolve ? (
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => resolveAccountDispute(d, 'upheld')} disabled={actioning === d.id}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                            {actioning === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Uphold
                          </button>
                          <button onClick={() => resolveAccountDispute(d, 'overturned')} disabled={actioning === d.id}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                            {actioning === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Overturn
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-sr-text-muted flex-shrink-0 italic">You issued this restriction — another admin must review it</span>
                      )
                    )}
                  </div>

                  <div className="bg-sr-surface rounded-lg p-3 mb-3">
                    <p className="text-[10px] text-sr-text-muted uppercase tracking-wide mb-1">Original reason</p>
                    <p className="text-sm text-sr-silver">{log?.reason || 'No reason recorded.'}</p>
                    {log?.suspended_until && <p className="text-xs text-sr-text-muted mt-1">Until {new Date(log.suspended_until).toLocaleDateString()}</p>}
                  </div>

                  {d.message && (
                    <div className="mb-3">
                      <p className="text-[10px] text-sr-text-muted uppercase tracking-wide mb-1">Their dispute message</p>
                      <p className="text-sm text-sr-silver">{d.message}</p>
                    </div>
                  )}

                  {log?.evidence_url && (
                    <a href={log.evidence_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-sr-purple-light hover:text-white transition-colors">
                      View evidence <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
      </div>
    </div>
  );
}
