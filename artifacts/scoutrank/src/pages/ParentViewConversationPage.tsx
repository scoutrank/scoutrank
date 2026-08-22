import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, fullName } from '@/lib/supabase';
import type { Message } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { timeAgo } from '@/utils/time';
import { ArrowLeft, Loader2, Shield, MessageCircle, User, MoreVertical } from 'lucide-react';

type PersonRef = { id: string; first_name: string; last_name: string; username: string; avatar_url: string | null };

const REPORT_CATEGORIES = [
  ['harassment', 'Harassment or bullying'],
  ['inappropriate_content', 'Inappropriate content'],
  ['underage_safety', 'Safety concern about a minor'],
  ['spam', 'Spam'],
  ['other', 'Other'],
];

/**
 * A parent's view of a conversation between their linked (minor) child
 * and a coach/scout — reached only from the coach_contacted_child
 * notification. Deliberately narrow: read access exists purely for the
 * safety purpose of letting a parent see who's contacting their child
 * and report a concern, not general message management — a parent can't
 * send, delete, or react, only look and report. Backed by a matching RLS
 * policy on `messages`.
 */
export default function ParentViewConversationPage() {
  const { profile } = useAuth();
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Record<string, PersonRef>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFullChat, setShowFullChat] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [reportModal, setReportModal] = useState<Message | null>(null);
  const [reportCategory, setReportCategory] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [reportError, setReportError] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      setIsLoading(true);
      setError('');
      const { data, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (msgErr) {
        setError(msgErr.message.includes('policy') || msgErr.message.includes('permission')
          ? "This conversation isn't available to view — it may not involve one of your linked children."
          : msgErr.message);
        setIsLoading(false);
        return;
      }

      const rows = (data as Message[] | null) ?? [];
      setMessages(rows);

      const senderIds = [...new Set(rows.map(m => m.sender_id))];
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, username, avatar_url').in('id', senderIds);
        const map: Record<string, PersonRef> = {};
        ((profiles as PersonRef[] | null) ?? []).forEach(p => { map[p.id] = p; });
        setPeople(map);
      }
      setIsLoading(false);
    })();

    // Live — new messages appear immediately instead of only showing
    // whatever existed the moment this page first loaded.
    const channel = supabase
      .channel(`parent-conversation-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async payload => {
        const newMsg = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        setPeople(prev => {
          if (prev[newMsg.sender_id]) return prev;
          supabase.from('profiles').select('id, first_name, last_name, username, avatar_url').eq('id', newMsg.sender_id).maybeSingle()
            .then(({ data: p }) => { if (p) setPeople(cur => ({ ...cur, [newMsg.sender_id]: p as PersonRef })); });
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  const firstMessage = messages[0];
  const coach = firstMessage ? people[firstMessage.sender_id] : null;
  const childId = firstMessage ? [...new Set(messages.map(m => m.sender_id))].find(id => id !== firstMessage.sender_id) : null;

  const submitReport = async () => {
    if (!reportModal || !profile || !reportCategory) { setReportError('Please select a category.'); return; }
    setReportSubmitting(true);
    setReportError('');
    const { error: err } = await supabase.from('reports').insert({
      reporter_id: profile.id,
      reported_profile_id: reportModal.sender_id,
      reported_message_id: reportModal.id,
      category: reportCategory,
      reason: reportReason.trim() || reportCategory,
    });
    setReportSubmitting(false);
    if (err) {
      setReportError(err.message.includes('Rate limit') ? err.message.replace(/^.*Rate limit exceeded: /, '') : 'Could not submit report. Please try again.');
      return;
    }
    setReportSubmitted(true);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/parent" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-5 w-5 text-sr-purple-light" />
        <h1 className="text-xl font-bold text-white">Conversation Review</h1>
      </div>
      <p className="text-sm text-sr-text-muted mb-6">
        Shown here because a verified coach or scout messaged your linked child for the first time.
      </p>

      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 text-sr-purple animate-spin" /></div>
      ) : !error && messages.length === 0 ? (
        <p className="text-sm text-sr-text-muted text-center py-12">No messages found.</p>
      ) : (
        <>
          <div className="card-premium p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple/50 to-sr-blue/50 flex items-center justify-center text-sm font-bold text-white">
              {coach?.avatar_url ? <img src={coach.avatar_url} alt="" className="h-full w-full object-cover" /> : (coach ? `${coach.first_name?.[0] ?? ''}${coach.last_name?.[0] ?? ''}` : '?')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{coach ? fullName(coach as never) : 'Unknown'}</p>
              <p className="text-xs text-sr-text-muted">@{coach?.username ?? 'unknown'} &middot; first messaged {firstMessage ? timeAgo(firstMessage.created_at) : ''}</p>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={() => setShowFullChat(v => !v)}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
              <MessageCircle className="h-4 w-4" /> {showFullChat ? 'Hide Chat' : 'View Chat'}
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            {coach && (
              <Link to={`/profile/${coach.username}`}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30">
                <User className="h-4 w-4" /> View Profile
              </Link>
            )}
          </div>

          {showFullChat && (
            <div className="card-premium p-4 space-y-3 overflow-y-auto mt-4" style={{ maxHeight: '480px' }} onClick={() => setOpenMenuId(null)}>
              {messages.map(msg => {
                const sender = people[msg.sender_id];
                const isChild = msg.sender_id === childId;
                return (
                  <div key={msg.id} className={`flex flex-col ${isChild ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      {sender && (
                        <Link to={`/profile/${sender.username}`} className="text-[11px] text-sr-text-muted hover:text-sr-purple-light transition-colors">
                          {fullName(sender as never)}
                        </Link>
                      )}
                      <span className="text-[10px] text-sr-text-muted">{timeAgo(msg.created_at)}</span>
                    </div>
                    <div className="flex items-end gap-1 max-w-[85%]">
                      {!isChild && (
                        <div className="relative flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === msg.id ? null : msg.id); }}
                            className="p-1 rounded-lg text-sr-text-muted hover:text-white hover:bg-sr-surface-light">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                          {openMenuId === msg.id && (
                            <div className="absolute left-0 bottom-full mb-1 w-32 card-premium p-1 z-10" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setOpenMenuId(null); setReportModal(msg); setReportCategory(''); setReportReason(''); setReportError(''); setReportSubmitted(false); }}
                                className="w-full text-left px-2 py-1.5 text-xs text-red-400 hover:bg-sr-surface-light rounded-lg">Report message</button>
                            </div>
                          )}
                        </div>
                      )}
                      <div className={`rounded-2xl px-3.5 py-2 ${isChild ? 'bg-sr-purple text-white' : 'bg-sr-surface-light text-sr-silver'}`}>
                        {msg.content && <p className="text-sm break-words">{msg.content}</p>}
                        {msg.media_url && msg.media_type === 'photo' && <img src={msg.media_url} alt="" className="max-h-56 rounded-lg mt-1" />}
                        {msg.media_url && msg.media_type === 'video' && <video src={msg.media_url} controls className="max-h-56 rounded-lg mt-1" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setReportModal(null)}>
          <div className="w-full max-w-sm card-premium p-5" onClick={e => e.stopPropagation()}>
            {reportSubmitted ? (
              <>
                <h3 className="text-sm font-semibold text-white mb-2">Report submitted</h3>
                <p className="text-xs text-sr-text-muted mb-4">Our team will review this message.</p>
                <button onClick={() => setReportModal(null)} className="w-full text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">Done</button>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-white mb-1">Report Message</h3>
                <p className="text-xs text-sr-text-muted mb-4">Select why this message is a problem.</p>
                {reportError && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{reportError}</div>}
                <div className="space-y-1.5 mb-3">
                  {REPORT_CATEGORIES.map(([value, label]) => (
                    <button key={value} onClick={() => setReportCategory(value)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs border transition-all ${
                        reportCategory === value ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="block text-xs text-sr-text-muted mb-1">Additional details (optional)</label>
                <textarea value={reportReason} onChange={e => setReportReason(e.target.value)} rows={2}
                  className="input-dark w-full resize-none text-sm mb-3" placeholder="Anything else that would help us review this?" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setReportModal(null)} className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">Cancel</button>
                  <button onClick={submitReport} disabled={reportSubmitting || !reportCategory}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                    {reportSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Submit Report
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
