import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { applyAccountModeration, issueWarning, endOfDayISOString, type ModerationAction } from '@/lib/accountModeration';
import { Loader2, AlertCircle, Flag, Check, X, Play, Trash2, ShieldOff, Ban } from 'lucide-react';
import { AdminTopNav } from '@/components/layout/AdminTopNav';

interface ReportRow {
  id: string;
  stat_id: string;
  reason: string;
  status: 'open' | 'resolved';
  resolution: string | null;
  created_at: string;
  reporter: { first_name: string; last_name: string; username: string } | null;
  athlete_stats: {
    id: string;
    value: number;
    evidence_url: string | null;
    evidence_description: string | null;
    verification_status: string;
    profiles: { id: string; first_name: string; last_name: string; username: string } | null;
    stat_event_types: { label: string; unit: string } | null;
  } | null;
}

export default function AdminEvidenceReportsPage() {
  const { isAdmin, profile } = useAuth();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [viewing, setViewing] = useState<ReportRow | null>(null);
  const [takingActionOn, setTakingActionOn] = useState<string | null>(null);
  const [chosenAction, setChosenAction] = useState<ModerationAction | 'warn'>('warn');
  const [actionReason, setActionReason] = useState('');
  const [suspendUntil, setSuspendUntil] = useState('');

  const dismiss = async (row: ReportRow) => {
    if (!profile) return;
    setActioning(row.id);
    setError('');
    const { error: err } = await supabase.from('stat_evidence_reports')
      .update({ status: 'resolved', resolution: 'dismissed', resolved_by: profile.id, resolved_at: new Date().toISOString() })
      .eq('id', row.id);
    setActioning(null);
    if (err) { setError(err.message); return; }
    setReports(prev => prev.map(r => r.id === row.id ? { ...r, status: 'resolved', resolution: 'dismissed' } : r));
  };

  const startTakingAction = (row: ReportRow) => {
    setTakingActionOn(row.id);
    setChosenAction('warn');
    setActionReason(`Fake stat evidence — reported: ${row.reason}`);
    setSuspendUntil('');
    setError('');
  };

  const confirmFakeStat = async (row: ReportRow) => {
    if (!profile || !row.athlete_stats?.profiles) return;
    if (!actionReason.trim()) { setError('A reason is required.'); return; }
    setActioning(row.id);
    setError('');

    // Delete the fake stat outright — no reason to keep proven-fraudulent
    // evidence around even in a "disputed" limbo state.
    const { error: delErr } = await supabase.from('athlete_stats').delete().eq('id', row.stat_id);
    if (delErr) { setActioning(null); setError(`Failed to delete stat: ${delErr.message}`); return; }

    // Punitive reset — wipes the score back to "Not Ranked" outright,
    // regardless of any other genuinely legitimate verified stats they
    // still have. This is deliberate: submitting one fake stat costs the
    // whole standing, not just the one result. It'll naturally rebuild
    // as they keep submitting real, verified stats going forward — this
    // isn't a permanent lock, just a real, immediate consequence now.
    const targetUserId = row.athlete_stats.profiles.id;
    const { error: scoreErr } = await supabase.from('profiles').update({ scoutrank_score: null }).eq('id', targetUserId);
    if (scoreErr) { setActioning(null); setError(`Failed to reset ScoutRank score: ${scoreErr.message}`); return; }
    const { error: rankErr } = await supabase.from('rankings').delete().eq('profile_id', targetUserId);
    if (rankErr) { setActioning(null); setError(`Score reset, but failed to clear rankings: ${rankErr.message}`); return; }

    const result = chosenAction === 'warn'
      ? await issueWarning({ performedBy: profile.id, targetUserId, reason: actionReason.trim() })
      : await applyAccountModeration({
          performedBy: profile.id,
          targetUserId,
          action: chosenAction,
          reason: actionReason.trim(),
          until: chosenAction === 'suspend' && suspendUntil ? endOfDayISOString(suspendUntil) : null,
          evidenceUrl: row.athlete_stats.evidence_url ?? null,
        });
    if (!result.ok) { setActioning(null); setError(result.error ?? 'Action failed.'); return; }

    const { error: err } = await supabase.from('stat_evidence_reports')
      .update({ status: 'resolved', resolution: 'upheld', resolved_by: profile.id, resolved_at: new Date().toISOString() })
      .eq('id', row.id);
    setActioning(null);
    if (err) { setError(err.message); return; }
    setReports(prev => prev.map(r => r.id === row.id ? { ...r, status: 'resolved', resolution: 'upheld' } : r));
    setTakingActionOn(null);
    setViewing(null);
  };

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;
  }

  const load = async () => {
    setIsLoading(true);
    setError('');
    let q = supabase
      .from('stat_evidence_reports')
      .select('id, stat_id, reason, status, resolution, created_at, reporter:reporter_id(first_name, last_name, username), athlete_stats(id, value, evidence_url, evidence_description, verification_status, profiles(id, first_name, last_name, username), stat_event_types(label, unit))')
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error: qErr } = await q;
    if (qErr) { setError(qErr.message); setIsLoading(false); return; }
    setReports((data as unknown as ReportRow[]) ?? []);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="min-h-screen bg-sr-bg">
      <AdminTopNav />
      <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Flag className="h-7 w-7 text-sr-purple-light" />
        <h1 className="text-2xl font-bold text-white">Evidence Reports</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">{reports.length} shown</span>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(['open', 'resolved', 'all'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors ${
              statusFilter === s ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : reports.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Flag className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold mb-1">No {statusFilter === 'all' ? '' : statusFilter} evidence reports</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => {
            const s = r.athlete_stats;
            return (
              <div key={r.id} className="card-premium p-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {s ? `${s.value} ${s.stat_event_types?.unit ?? ''} — ${s.stat_event_types?.label ?? 'Custom event'}` : 'Stat deleted'}
                    </p>
                    {s?.profiles && (
                      <Link to={`/profile/${s.profiles.username}`} className="text-xs text-sr-purple-light hover:text-white">
                        {fullName(s.profiles)} (@{s.profiles.username})
                      </Link>
                    )}
                  </div>
                  <span className="text-[10px] text-sr-text-muted flex-shrink-0">{timeAgo(r.created_at)}</span>
                </div>
                <p className="text-xs text-sr-silver mb-1">
                  Reported by {r.reporter ? `${fullName(r.reporter)} (@${r.reporter.username})` : 'unknown'}:
                </p>
                <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 mb-3">{r.reason}</p>

                {s?.evidence_url && (
                  <button onClick={() => setViewing(r)} className="text-xs text-sr-purple-light hover:text-white flex items-center gap-1 mb-3">
                    <Play className="h-3.5 w-3.5" /> View Evidence
                  </button>
                )}

                {r.status === 'resolved' ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                    r.resolution === 'upheld' ? 'text-red-400 bg-red-400/10 border-red-400/20' : 'text-green-400 bg-green-400/10 border-green-400/20'
                  }`}>{r.resolution}</span>
                ) : takingActionOn === r.id ? (
                  <div className="mt-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <p className="text-xs text-red-400 font-semibold mb-2">Confirmed fake — this deletes the stat, resets their ScoutRank score to Not Ranked (even if they have other legitimate verified stats), and applies a real consequence to the account:</p>
                    <div className="flex gap-2 mb-2">
                      {(['warn', 'suspend', 'ban'] as const).map(a => (
                        <button key={a} onClick={() => setChosenAction(a)}
                          className={`flex-1 text-xs px-2 py-1.5 rounded-lg border capitalize transition-colors ${
                            chosenAction === a ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
                          }`}>
                          {a}
                        </button>
                      ))}
                    </div>
                    {chosenAction === 'suspend' && (
                      <input type="date" value={suspendUntil} onChange={e => setSuspendUntil(e.target.value)}
                        className="input-dark w-full text-xs mb-2" placeholder="Suspend until (optional)" />
                    )}
                    <textarea value={actionReason} onChange={e => setActionReason(e.target.value)} rows={2}
                      className="input-dark w-full resize-none text-xs mb-2" placeholder="Reason (goes on their record)" />
                    {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => setTakingActionOn(null)} className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                        Cancel
                      </button>
                      <button onClick={() => confirmFakeStat(r)} disabled={actioning === r.id}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                        {actioning === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                          chosenAction === 'warn' ? <ShieldOff className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        Delete Stat & {chosenAction === 'warn' ? 'Warn' : chosenAction === 'suspend' ? 'Suspend' : 'Ban'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => startTakingAction(r)} disabled={!r.athlete_stats?.profiles || actioning === r.id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" /> Confirmed Fake — Take Action
                    </button>
                    <button onClick={() => dismiss(r)} disabled={actioning === r.id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30 disabled:opacity-50">
                      {actioning === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Dismiss
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewing?.athlete_stats?.evidence_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setViewing(null)}>
          <div className="card-premium max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-sr-border flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Evidence</p>
              <button onClick={() => setViewing(null)} className="text-sr-text-muted hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="bg-black flex items-center justify-center max-h-[60vh]">
              {/^.*\.(mp4|mov|webm|m4v)(\?|$)/i.test(viewing.athlete_stats.evidence_url) ? (
                <video src={viewing.athlete_stats.evidence_url} controls className="max-h-[60vh] w-full" />
              ) : (
                <img src={viewing.athlete_stats.evidence_url} alt="" className="max-h-[60vh] w-full object-contain" />
              )}
            </div>
            {viewing.athlete_stats.evidence_description && (
              <p className="p-4 text-xs text-sr-silver">Athlete's description: "{viewing.athlete_stats.evidence_description}"</p>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
