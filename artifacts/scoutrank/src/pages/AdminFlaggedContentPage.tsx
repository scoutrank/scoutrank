import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { AlertTriangle, Loader2, AlertCircle, Check, Trash2, ArrowLeft, History } from 'lucide-react';
import { AccountHistoryModal } from '@/components/AccountHistoryModal';

interface FlagRow {
  id: string;
  post_id: string | null;
  comment_id: string | null;
  profile_id: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'dismissed' | 'removed';
  created_at: string;
  posts: { caption: string | null; media_url: string | null; media_type: string | null } | null;
  post_comments: { content: string } | null;
  profiles: { username: string; first_name: string; last_name: string } | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  low:    'text-blue-400 bg-blue-400/10 border-blue-400/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  high:   'text-red-400 bg-red-400/10 border-red-400/20',
};

/**
 * Every new post and highlight is scanned by AI on submission (see the
 * moderate-post Edge Function) for anything that looks genuinely
 * inappropriate or dangerous — nudity, gore, dangerous acts, hate
 * content, etc. Flagged items land here for a human to make the real
 * call: dismiss the flag (post stays up) or remove the post entirely.
 * The AI never deletes anything on its own — this queue is the only
 * place that actually happens.
 */
export default function AdminFlaggedContentPage() {
  const { isAdmin, profile } = useAuth();
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'dismissed' | 'removed' | 'all'>('open');
  const [removeModal, setRemoveModal] = useState<FlagRow | null>(null);
  const [historyModal, setHistoryModal] = useState<{ targetUserId: string; targetName: string } | null>(null);
  const [reasonChoice, setReasonChoice] = useState<'ai' | 'custom'>('ai');
  const [customReason, setCustomReason] = useState('');

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;
  }

  const load = async () => {
    setIsLoading(true);
    setError('');
    let q = supabase
      .from('flagged_content')
      .select(`
        id, post_id, comment_id, profile_id, reason, severity, status, created_at,
        posts:post_id(caption, media_url, media_type),
        post_comments:comment_id(content),
        profiles:profile_id(username, first_name, last_name)
      `)
      .order('created_at', { ascending: false })
      .limit(100);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error: qErr } = await q;
    if (qErr) { setError(qErr.message); setIsLoading(false); return; }
    setFlags((data as unknown as FlagRow[]) ?? []);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  // New flags show up here the instant moderate-post creates them — no
  // reload needed on the admin's end.
  useEffect(() => {
    const channel = supabase
      .channel('admin-flagged-content-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flagged_content' }, async payload => {
        const newFlag = payload.new as { id: string; status: string };
        if (statusFilter !== 'all' && newFlag.status !== statusFilter) return;
        const { data } = await supabase
          .from('flagged_content')
          .select(`
            id, post_id, comment_id, profile_id, reason, severity, status, created_at,
            posts:post_id(caption, media_url, media_type),
            post_comments:comment_id(content),
            profiles:profile_id(username, first_name, last_name)
          `)
          .eq('id', newFlag.id)
          .maybeSingle();
        if (!data) return;
        setFlags(prev => prev.some(f => f.id === newFlag.id) ? prev : [data as unknown as FlagRow, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [statusFilter]);

  const dismissFlag = async (flag: FlagRow) => {
    setActioning(flag.id);
    const { error: err } = await supabase.from('flagged_content')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
      .eq('id', flag.id);
    setActioning(null);
    if (err) { setError(err.message); return; }
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, status: 'dismissed' } : f));
  };

  const confirmRemovePost = async () => {
    if (!removeModal || !profile) return;
    const reason = reasonChoice === 'ai' ? removeModal.reason : customReason.trim();
    if (!reason) { setError('A reason is required.'); return; }
    const isComment = !!removeModal.comment_id;

    setActioning(removeModal.id);
    setError('');
    const table = isComment ? 'post_comments' : 'posts';
    const targetId = isComment ? removeModal.comment_id! : removeModal.post_id!;
    const { error: deleteErr, data } = await supabase.from(table).delete().eq('id', targetId).select('id');
    if (deleteErr) { setError(`Failed to delete ${isComment ? 'comment' : 'post'}: ${deleteErr.message}`); setActioning(null); return; }
    if (!data || data.length === 0) {
      setError(`Delete did not apply — no row was changed. This usually means the admin DELETE policy on ${table} is missing.`);
      setActioning(null);
      return;
    }

    const { error: noticeErr } = await supabase.from('post_removal_notices').insert({
      profile_id: removeModal.profile_id,
      post_caption: isComment ? removeModal.post_comments?.content ?? null : removeModal.posts?.caption ?? null,
      reason,
      removed_by: profile.id,
    });

    const { error: flagErr } = await supabase.from('flagged_content')
      .update({ status: 'removed', resolved_at: new Date().toISOString() })
      .eq('id', removeModal.id);
    setActioning(null);
    if (noticeErr) { setError(`${isComment ? 'Comment' : 'Post'} deleted, but failed to notify the owner: ${noticeErr.message}`); return; }
    if (flagErr) { setError(`${isComment ? 'Comment' : 'Post'} deleted, but failed to update the flag record: ${flagErr.message}`); return; }
    setFlags(prev => prev.map(f => f.id === removeModal.id ? { ...f, status: 'removed' } : f));
    setRemoveModal(null);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle className="h-7 w-7 text-yellow-400" />
        <h1 className="text-2xl font-bold text-white">AI Flagged Content</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">
          {flags.length} shown
        </span>
      </div>
      <p className="text-sm text-sr-text-muted mb-6">
        Posts and highlights AI flagged as potentially inappropriate or dangerous when submitted. The AI never removes anything itself — dismiss to keep the post up, or remove it here.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(['open', 'dismissed', 'removed', 'all'] as const).map(s => (
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
      ) : flags.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold mb-1">No {statusFilter === 'all' ? '' : statusFilter} flagged content</p>
          <p className="text-sm text-sr-text-muted">Nothing needs review right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map(f => (
            <div key={f.id} className="card-premium p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${SEVERITY_STYLES[f.severity]}`}>
                      {f.severity} severity
                    </span>
                    {f.status !== 'open' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-sr-border text-sr-text-muted uppercase">{f.status}</span>
                    )}
                    <span className="text-xs text-sr-text-muted">{timeAgo(f.created_at)}</span>
                  </div>
                  {f.profiles && (
                    <Link to={`/profile/${f.profiles.username}`} className="text-xs text-sr-purple-light hover:text-white transition-colors">
                      {fullName(f.profiles)} (@{f.profiles.username})
                    </Link>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setHistoryModal({ targetUserId: f.profile_id, targetName: f.profiles ? fullName(f.profiles) : 'this account' })}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                    <History className="h-3.5 w-3.5" /> History
                  </button>
                  {f.status === 'open' && (
                    <>
                      <button onClick={() => dismissFlag(f)} disabled={actioning === f.id}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30 disabled:opacity-50">
                        {actioning === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Dismiss
                      </button>
                      <button onClick={() => { setRemoveModal(f); setReasonChoice('ai'); setCustomReason(''); setError(''); }} disabled={actioning === f.id}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                        {actioning === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove {f.comment_id ? 'Comment' : 'Post'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-sr-surface rounded-lg p-3 mb-3">
                <p className="text-[10px] text-sr-text-muted uppercase tracking-wide mb-1">Why AI flagged this</p>
                <p className="text-sm text-sr-silver">{f.reason}</p>
              </div>

              {f.comment_id ? (
                f.post_comments ? (
                  <div>
                    <p className="text-[10px] text-sr-text-muted uppercase tracking-wide mb-1">Flagged comment</p>
                    <p className="text-sm text-sr-silver bg-sr-bg rounded-lg p-2.5">"{f.post_comments.content}"</p>
                  </div>
                ) : (
                  <p className="text-xs text-sr-text-muted italic">Comment no longer exists.</p>
                )
              ) : f.posts ? (
                <div>
                  {f.posts.caption && <p className="text-sm text-sr-silver mb-2">{f.posts.caption}</p>}
                  {f.posts.media_url && f.posts.media_type === 'photo' && (
                    <img src={f.posts.media_url} alt="" className="max-h-64 rounded-lg" />
                  )}
                  {f.posts.media_url && f.posts.media_type === 'video' && (
                    <video src={f.posts.media_url} controls className="max-h-64 rounded-lg" />
                  )}
                </div>
              ) : (
                <p className="text-xs text-sr-text-muted italic">Post no longer exists.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {removeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRemoveModal(null)}>
          <div className="w-full max-w-sm card-premium p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Remove {removeModal.comment_id ? 'Comment' : 'Post'}</h3>
            <p className="text-xs text-sr-text-muted mb-4">The owner will be shown this reason the next time they use the app.</p>

            {error && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
            )}

            <div className="space-y-2 mb-3">
              <label className="flex items-start gap-2 p-2.5 rounded-lg border border-sr-border cursor-pointer hover:border-sr-purple/30">
                <input type="radio" checked={reasonChoice === 'ai'} onChange={() => setReasonChoice('ai')} className="mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-white">Use AI's reason</p>
                  <p className="text-xs text-sr-text-muted">{removeModal.reason}</p>
                </div>
              </label>
              <label className="flex items-start gap-2 p-2.5 rounded-lg border border-sr-border cursor-pointer hover:border-sr-purple/30">
                <input type="radio" checked={reasonChoice === 'custom'} onChange={() => setReasonChoice('custom')} className="mt-0.5" />
                <p className="text-xs font-medium text-white">Write my own reason</p>
              </label>
            </div>

            {reasonChoice === 'custom' && (
              <textarea value={customReason} onChange={e => setCustomReason(e.target.value)} rows={3}
                className="input-dark w-full resize-none text-sm mb-3" placeholder="Why is this post being removed?" />
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setRemoveModal(null)} className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                Cancel
              </button>
              <button onClick={confirmRemovePost} disabled={actioning === removeModal.id}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                {actioning === removeModal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove {removeModal.comment_id ? 'Comment' : 'Post'}
              </button>
            </div>
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
    </div>
  );
}
