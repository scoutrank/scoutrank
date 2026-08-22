import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import type { AccountModerationLog, AccountDispute } from '@/lib/supabase';
import { Logo } from '@/components/ui/Logo';
import { ShieldOff, Ban, Loader2, AlertCircle, Send, Clock, CheckCircle2 } from 'lucide-react';

export default function AccountRestrictedPage() {
  const { profile, logout } = useAuth();
  const [latestLog, setLatestLog] = useState<AccountModerationLog | null>(null);
  const [existingDispute, setExistingDispute] = useState<AccountDispute | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeMessage, setDisputeMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: logData, error: logErr } = await supabase
        .from('account_moderation_log')
        .select('*')
        .eq('profile_id', profile.id)
        .in('action', ['suspended', 'banned'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (logErr) {
        setError(`Could not load restriction details: ${logErr.message}`);
        setIsLoading(false);
        return;
      }

      const log = logData as AccountModerationLog | null;
      setLatestLog(log);
      if (!log) {
        setError('Could not find a record of this restriction — the dispute button won\'t work until this is fixed. Contact support.');
      }

      if (log) {
        const { data: disputeData } = await supabase
          .from('account_disputes')
          .select('*')
          .eq('moderation_log_id', log.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setExistingDispute(disputeData as AccountDispute | null);
      }
      setIsLoading(false);
    })();
  }, [profile?.id]);

  if (!profile) return null;

  const isBanned = profile.account_status === 'banned';

  const submitDispute = async () => {
    if (!latestLog) { setError('Cannot submit — no restriction record was found to attach this dispute to.'); return; }
    setIsSubmitting(true);
    setError('');
    const { data, error: err } = await supabase.from('account_disputes').insert({
      profile_id: profile.id,
      moderation_log_id: latestLog.id,
      message: disputeMessage.trim() || null,
      status: 'open',
    }).select('*').single();
    setIsSubmitting(false);
    if (err) { setError(`Could not submit dispute: ${err.message}`); return; }
    setExistingDispute(data as AccountDispute);
    setShowDisputeForm(false);
  };

  return (
    <div className="min-h-screen bg-sr-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Logo size="lg" className="justify-center mb-4" />
        </div>

        <div className="card-glass p-8 border-red-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isBanned ? 'bg-red-500/15' : 'bg-yellow-500/15'}`}>
              {isBanned ? <Ban className="h-5 w-5 text-red-400" /> : <ShieldOff className="h-5 w-5 text-yellow-400" />}
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Account {isBanned ? 'Banned' : 'Suspended'}</h1>
              <p className="text-xs text-sr-text-muted">{fullName(profile)} · @{profile.username}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 text-sr-purple animate-spin" /></div>
          ) : (
            <>
              {!isBanned && profile.suspended_until && (
                <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                  <Clock className="h-4 w-4 flex-shrink-0" />
                  Suspended until {new Date(profile.suspended_until).toLocaleDateString()}
                </div>
              )}

              <p className="text-xs text-sr-text-muted uppercase tracking-wide mb-1">Reason</p>
              <p className="text-sm text-sr-silver mb-4">{profile.status_reason || latestLog?.reason || 'No reason was recorded.'}</p>

              {(profile.status_evidence_url || latestLog?.evidence_url) && (
                <div className="mb-4">
                  <p className="text-xs text-sr-text-muted uppercase tracking-wide mb-1">Evidence</p>
                  {(() => {
                    const url = profile.status_evidence_url || latestLog?.evidence_url || '';
                    const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
                    return isVideo
                      ? <video src={url} controls className="w-full rounded-lg max-h-72" />
                      : <img src={url} alt="Evidence" className="w-full rounded-lg max-h-72 object-contain bg-black" />;
                  })()}
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
                </div>
              )}

              {existingDispute ? (
                <div className="p-3 rounded-lg bg-sr-purple/10 border border-sr-purple/20 text-sm text-sr-silver flex items-center gap-2 mb-4">
                  {existingDispute.status === 'open'
                    ? <><Clock className="h-4 w-4 flex-shrink-0 text-sr-purple-light" /> Your dispute has been submitted and is awaiting review.</>
                    : <><CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-400" /> Your dispute was reviewed — {existingDispute.resolution === 'overturned' ? 'the restriction was lifted.' : 'the decision was upheld.'}</>
                  }
                </div>
              ) : showDisputeForm ? (
                <div className="mb-4">
                  <label className="block text-xs text-sr-text-muted mb-1">Tell us why you think this was a mistake (optional)</label>
                  <textarea value={disputeMessage} onChange={e => setDisputeMessage(e.target.value)} rows={3}
                    className="input-dark w-full resize-none text-sm mb-2" placeholder="Explain your side..." />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowDisputeForm(false)} className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                      Cancel
                    </button>
                    <button onClick={submitDispute} disabled={isSubmitting}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                      {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Submit Dispute
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowDisputeForm(true)}
                  className="w-full text-sm px-4 py-2.5 rounded-lg border border-sr-purple/30 text-sr-purple-light hover:bg-sr-purple/10 mb-4">
                  Dispute this decision
                </button>
              )}
            </>
          )}

          <button onClick={logout} className="w-full text-xs text-sr-text-muted hover:text-white transition-colors text-center">
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
