import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { applyAccountModeration, issueWarning, endOfDayISOString, applyRestriction } from '@/lib/accountModeration';
import { uploadResumable, publicUrlFor } from '@/lib/mediaStorage';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/BrandButton';
import { timeAgo } from '@/utils/time';
import { Flag, Loader2, AlertCircle, ExternalLink, Check, X, ArrowLeft, ShieldOff, Ban, MessageSquareWarning, History, EyeOff } from 'lucide-react';
import { AccountHistoryModal } from '@/components/AccountHistoryModal';
import { AdminConversationModal } from '@/components/AdminConversationModal';

interface ReportRow {
  id: string;
  reporter_id: string;
  reported_profile_id: string | null;
  reported_post_id: string | null;
  reported_message_id: string | null;
  category: string | null;
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewed' | 'dismissed' | 'actioned';
  created_at: string;
  reviewed_at: string | null;
  reporter?: { username: string; first_name: string; last_name: string };
  reported_profile?: { username: string; first_name: string; last_name: string } | null;
  reported_message?: { content: string | null; conversation_id: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  reviewed:  'text-blue-400  bg-blue-400/10  border-blue-400/20',
  dismissed: 'text-sr-text-muted bg-sr-surface border-sr-border',
  actioned:  'text-green-400  bg-green-400/10  border-green-400/20',
};

const CATEGORY_LABELS: Record<string, string> = {
  fake_profile: 'Fake profile',
  misleading_information: 'Misleading information',
  inappropriate_content: 'Inappropriate content',
  harassment: 'Harassment or bullying',
  underage_safety: 'Underage safety concern',
  spam: 'Spam',
  other: 'Other',
};

export default function AdminReportsPage() {
  const { isAdmin, profile } = useAuth();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [reportCounts, setReportCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // All-time report count per account, across every status — used to
    // surface repeat offenders first, and to show a "N reports" badge so
    // an admin immediately sees whether this is a first-time complaint or
    // a pattern, before even opening History.
    supabase.from('reports').select('reported_profile_id').not('reported_profile_id', 'is', null).then(({ data }) => {
      const counts: Record<string, number> = {};
      ((data ?? []) as { reported_profile_id: string }[]).forEach(r => {
        counts[r.reported_profile_id] = (counts[r.reported_profile_id] ?? 0) + 1;
      });
      setReportCounts(counts);
    });
  }, []);

  const [actionModal, setActionModal] = useState<{ report: ReportRow; targetUserId: string } | null>(null);
  const [priorActionCount, setPriorActionCount] = useState<number | null>(null);
  const [actionChoice, setActionChoice] = useState<'warn' | 'suspend' | 'ban' | 'restrict' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionUntil, setActionUntil] = useState('');
  const [actionEvidenceUrl, setActionEvidenceUrl] = useState<string | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [actionError, setActionError] = useState('');

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;
  }

  const load = async () => {
    setIsLoading(true);
    setError('');
    let q = supabase
      .from('reports')
      .select(`
        id, reporter_id, reported_profile_id, reported_post_id, reported_message_id,
        category, reason, details, status, created_at, reviewed_at,
        reporter:reporter_id(username, first_name, last_name),
        reported_profile:reported_profile_id(username, first_name, last_name),
        reported_message:reported_message_id(content, conversation_id)
      `)
      .order('created_at', { ascending: false })
      .limit(100);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error: qErr } = await q;
    if (qErr) { setError(qErr.message); setIsLoading(false); return; }
    setReports((data as unknown as ReportRow[]) ?? []);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const updateStatus = async (id: string, newStatus: ReportRow['status']) => {
    setActioning(id);
    const { error: upErr } = await supabase.from('reports').update({
      status: newStatus,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    setActioning(null);
    if (upErr) { setError(upErr.message); return; }
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus, reviewed_at: new Date().toISOString() } : r));
  };

  const [historyModal, setHistoryModal] = useState<{ targetUserId: string; targetName: string } | null>(null);
  const [conversationModal, setConversationModal] = useState<{ conversationId: string; messageId: string } | null>(null);

  const resolveTargetUserId = async (report: ReportRow): Promise<string | null> => {
    if (report.reported_profile_id) return report.reported_profile_id;
    if (report.reported_post_id) {
      const { data } = await supabase.from('posts').select('profile_id').eq('id', report.reported_post_id).maybeSingle();
      return (data as { profile_id: string } | null)?.profile_id ?? null;
    }
    if (report.reported_message_id) {
      const { data } = await supabase.from('messages').select('sender_id').eq('id', report.reported_message_id).maybeSingle();
      return (data as { sender_id: string } | null)?.sender_id ?? null;
    }
    return null;
  };

  const openActionModal = async (report: ReportRow) => {
    const targetUserId = await resolveTargetUserId(report);
    if (!targetUserId) { setError('Could not determine which account this report is about.'); return; }
    setActionModal({ report, targetUserId });
    setActionChoice(null);
    setActionReason('');
    setActionUntil('');
    setActionEvidenceUrl(null);
    setActionError('');
    setPriorActionCount(null);
    const [logRes, warnRes] = await Promise.all([
      supabase.from('account_moderation_log').select('id', { count: 'exact', head: true }).eq('profile_id', targetUserId).in('action', ['suspended', 'banned']),
      supabase.from('account_warnings').select('id', { count: 'exact', head: true }).eq('profile_id', targetUserId),
    ]);
    setPriorActionCount((logRes.count ?? 0) + (warnRes.count ?? 0));
  };

  const openHistoryModal = async (report: ReportRow) => {
    const targetUserId = await resolveTargetUserId(report);
    if (!targetUserId) { setError('Could not determine which account this report is about.'); return; }
    const targetName = report.reported_profile
      ? `${report.reported_profile.first_name} ${report.reported_profile.last_name}`
      : 'this account';
    setHistoryModal({ targetUserId, targetName });
  };

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !actionModal) return;
    setUploadingEvidence(true);
    setUploadPercent(0);
    setActionError('');
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${actionModal.targetUserId}/${Date.now()}.${ext}`;
      await uploadResumable('moderation-evidence', path, file, {
        contentType: file.type,
        onProgress: p => setUploadPercent(p.percent),
      });
      setActionEvidenceUrl(publicUrlFor('moderation-evidence', path));
    } catch (err) {
      setActionError(`Evidence upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadingEvidence(false);
    }
  };

  const confirmAction = async () => {
    if (!actionModal || !profile || !actionChoice) return;
    if (!actionReason.trim()) { setActionError('A reason is required.'); return; }
    if (actionChoice === 'suspend' && !actionUntil) { setActionError('An end date is required for a suspension.'); return; }

    setActioning(actionModal.report.id);
    setActionError('');

    const result = actionChoice === 'warn'
      ? await issueWarning({ performedBy: profile.id, targetUserId: actionModal.targetUserId, reason: actionReason.trim() })
      : actionChoice === 'restrict'
      ? await applyRestriction({ performedBy: profile.id, targetUserId: actionModal.targetUserId, reason: actionReason.trim() })
      : await applyAccountModeration({
          performedBy: profile.id,
          targetUserId: actionModal.targetUserId,
          action: actionChoice,
          reason: actionReason.trim(),
          until: actionChoice === 'suspend' ? endOfDayISOString(actionUntil) : null,
          evidenceUrl: actionEvidenceUrl,
        });

    if (!result.ok) { setActionError(result.error ?? 'Something went wrong.'); setActioning(null); return; }

    const { error: upErr } = await supabase.from('reports').update({
      status: 'actioned', reviewed_at: new Date().toISOString(),
    }).eq('id', actionModal.report.id);
    setActioning(null);
    if (upErr) { setActionError(`Account actioned, but failed to update the report: ${upErr.message}`); return; }

    setReports(prev => prev.map(r => r.id === actionModal.report.id ? { ...r, status: 'actioned', reviewed_at: new Date().toISOString() } : r));
    setActionModal(null);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <Flag className="h-7 w-7 text-red-400" />
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">
          {reports.length} shown
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Status filter */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex gap-2">
          {['pending', 'reviewed', 'dismissed', 'actioned', 'all'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors ${
                statusFilter === s ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
              }`}>
              {s}
            </button>
          ))}
        </div>
        <div className="w-52">
          <Select value={categoryFilter} onChange={setCategoryFilter}
            options={[{ value: 'all', label: 'All categories' }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))]}
            className="text-xs" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : reports.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Flag className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold mb-1">No {statusFilter === 'all' ? '' : statusFilter} reports</p>
          <p className="text-sm text-sr-text-muted">Nothing to review right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.filter(r => categoryFilter === 'all' || r.category === categoryFilter).sort((a, b) => {
            const countA = a.reported_profile_id ? (reportCounts[a.reported_profile_id] ?? 0) : 0;
            const countB = b.reported_profile_id ? (reportCounts[b.reported_profile_id] ?? 0) : 0;
            if (countB !== countA) return countB - countA;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }).map(r => (
            <div key={r.id} className="card-premium p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${STATUS_STYLES[r.status]}`}>
                      {r.status}
                    </span>
                    {r.category && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                        r.category === 'underage_safety' ? 'text-red-400 bg-red-400/10 border-red-400/20' : 'text-sr-text-muted bg-sr-surface border-sr-border'
                      }`}>
                        {CATEGORY_LABELS[r.category] ?? r.category}
                      </span>
                    )}
                    <span className="text-xs text-sr-text-muted">{timeAgo(r.created_at)}</span>
                  </div>
                  <p className="text-sm font-semibold text-white">{r.reason}</p>
                  {r.details && <p className="text-xs text-sr-text-muted mt-0.5">{r.details}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openHistoryModal(r)}
                    icon={<History className="h-3.5 w-3.5" />}>
                    History
                  </Button>
                  {r.status === 'pending' && (
                    <>
                      <Button variant="ghost" size="sm" disabled={actioning === r.id}
                        onClick={() => updateStatus(r.id, 'dismissed')}
                        icon={actioning === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}>
                        Dismiss
                      </Button>
                      <Button variant="brand" size="sm" disabled={actioning === r.id}
                        onClick={() => openActionModal(r)}
                        icon={actioning === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}>
                        Action
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-sr-text-muted mb-0.5">Reported by</p>
                  {r.reporter ? (
                    <Link to={`/profile/${r.reporter.username}`} className="text-sr-silver hover:text-white transition-colors">
                      {r.reporter.first_name} {r.reporter.last_name} (@{r.reporter.username})
                    </Link>
                  ) : <span className="text-sr-text-muted">Unknown</span>}
                </div>
                {r.reported_profile && (
                  <div>
                    <p className="text-sr-text-muted mb-0.5">Reported profile</p>
                    <div className="flex items-center gap-2">
                      <Link to={`/profile/${r.reported_profile.username}`} className="text-sr-silver hover:text-white transition-colors flex items-center gap-1">
                        {r.reported_profile.first_name} {r.reported_profile.last_name} (@{r.reported_profile.username})
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      {r.reported_profile_id && (reportCounts[r.reported_profile_id] ?? 0) > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 font-semibold flex-shrink-0">
                          {reportCounts[r.reported_profile_id]} reports
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {r.reported_post_id && (
                  <div>
                    <p className="text-sr-text-muted mb-0.5">Reported post</p>
                    <Link to={`/post/${r.reported_post_id}`} className="text-sr-purple-light hover:text-white transition-colors flex items-center gap-1">
                      View post <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}
                {r.reported_message_id && (
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sr-text-muted">Reported message</p>
                      {r.reported_message?.conversation_id && (
                        <button onClick={() => setConversationModal({ conversationId: r.reported_message!.conversation_id, messageId: r.reported_message_id! })}
                          className="text-[10px] text-sr-purple-light hover:text-white transition-colors">
                          View Full Chat
                        </button>
                      )}
                    </div>
                    {r.reported_message?.content ? (
                      <p className="text-sr-silver bg-sr-bg rounded-lg p-2">"{r.reported_message.content}"</p>
                    ) : (
                      <p className="text-sr-text-muted italic">Message no longer exists.</p>
                    )}
                  </div>
                )}
              </div>
              {r.reviewed_at && (
                <p className="text-[10px] text-sr-text-muted mt-2">Reviewed {timeAgo(r.reviewed_at)}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setActionModal(null)}>
          <div className="w-full max-w-sm card-premium p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Action This Report</h3>
            <p className="text-xs text-sr-text-muted mb-4">Choose what happens to the reported account.</p>

            {priorActionCount !== null && priorActionCount > 0 && (
              <div className="mb-4 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
                This account has {priorActionCount} prior warning/suspension/ban — worth checking History before deciding.
              </div>
            )}

            {actionError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{actionError}</div>
            )}

            {!actionChoice ? (
              <div className="space-y-2">
                <button onClick={() => setActionChoice('warn')}
                  className="w-full flex items-center gap-2.5 p-3 rounded-lg border border-sr-border hover:border-yellow-500/30 text-left">
                  <MessageSquareWarning className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                  <div><p className="text-sm text-white">Send a Warning</p><p className="text-xs text-sr-text-muted">Account stays active</p></div>
                </button>
                <button onClick={() => setActionChoice('restrict')}
                  className="w-full flex items-center gap-2.5 p-3 rounded-lg border border-sr-border hover:border-blue-500/30 text-left">
                  <EyeOff className="h-4 w-4 text-blue-400 flex-shrink-0" />
                  <div><p className="text-sm text-white">Restrict</p><p className="text-xs text-sr-text-muted">7 days — posts/comments/followers hidden from others</p></div>
                </button>
                <button onClick={() => setActionChoice('suspend')}
                  className="w-full flex items-center gap-2.5 p-3 rounded-lg border border-sr-border hover:border-yellow-500/30 text-left">
                  <ShieldOff className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                  <div><p className="text-sm text-white">Suspend</p><p className="text-xs text-sr-text-muted">Temporary, until a set date</p></div>
                </button>
                <button onClick={() => setActionChoice('ban')}
                  className="w-full flex items-center gap-2.5 p-3 rounded-lg border border-sr-border hover:border-red-500/30 text-left">
                  <Ban className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <div><p className="text-sm text-white">Ban</p><p className="text-xs text-sr-text-muted">Indefinite, until manually lifted</p></div>
                </button>
              </div>
            ) : (
              <>
                <label className="block text-xs text-sr-text-muted mb-1">Reason</label>
                <textarea value={actionReason} onChange={e => setActionReason(e.target.value)} rows={3}
                  className="input-dark w-full resize-none text-sm mb-3" placeholder="Why is this action being taken?" />

                {actionChoice === 'suspend' && (
                  <>
                    <label className="block text-xs text-sr-text-muted mb-1">Suspended until</label>
                    <input type="date" value={actionUntil} onChange={e => setActionUntil(e.target.value)}
                      min={new Date().toISOString().split('T')[0]} className="input-dark w-full text-sm mb-3" />
                  </>
                )}

                {(actionChoice === 'suspend' || actionChoice === 'ban') && (
                  <>
                    <label className="block text-xs text-sr-text-muted mb-1">Evidence (optional)</label>
                    <input type="file" accept="image/*,video/*" onChange={handleEvidenceUpload} disabled={uploadingEvidence}
                      className="block w-full text-xs text-sr-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sr-surface-light file:text-sr-silver mb-1" />
                    {uploadingEvidence && <p className="text-xs text-sr-text-muted mb-2">Uploading... {uploadPercent}%</p>}
                    {actionEvidenceUrl && !uploadingEvidence && <p className="text-xs text-green-400 mb-2">Evidence attached</p>}
                  </>
                )}

                <div className="flex gap-2 justify-end mt-2">
                  <button onClick={() => setActionChoice(null)} className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                    Back
                  </button>
                  <button onClick={confirmAction} disabled={actioning === actionModal.report.id || uploadingEvidence}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50 ${
                      actionChoice === 'ban' ? 'bg-red-500 hover:bg-red-600' : actionChoice === 'suspend' ? 'bg-yellow-500 hover:bg-yellow-600' : actionChoice === 'restrict' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-sr-purple hover:bg-sr-purple/90'
                    }`}>
                    {actioning === actionModal.report.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Confirm
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {historyModal && (
        <AccountHistoryModal
          targetUserId={historyModal.targetUserId}
          targetName={historyModal.targetName}
          onClose={() => setHistoryModal(null)}
        />
      )}

      {conversationModal && (
        <AdminConversationModal
          conversationId={conversationModal.conversationId}
          highlightMessageId={conversationModal.messageId}
          onClose={() => setConversationModal(null)}
        />
      )}
    </div>
  );
}
