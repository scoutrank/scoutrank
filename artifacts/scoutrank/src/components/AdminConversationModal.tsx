import { useState, useEffect } from 'react';
import { supabase, fullName } from '@/lib/supabase';
import type { Message } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { X, Loader2, MessageCircle } from 'lucide-react';

type PersonRef = { id: string; first_name: string; last_name: string; username: string; avatar_url: string | null };

/**
 * Full conversation, read-only, for an admin reviewing a message report —
 * a single reported message with no surrounding context can be
 * misleading (a reply to something provoking, sarcasm, etc.), so this
 * shows the whole thread instead.
 */
export function AdminConversationModal({ conversationId, highlightMessageId, onClose }: { conversationId: string; highlightMessageId?: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Record<string, PersonRef>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError('');
      const { data, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (msgErr) { setError(msgErr.message); setIsLoading(false); return; }

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
  }, [conversationId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg card-premium p-5 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> Full Conversation</h3>
          <button onClick={onClose} className="text-sr-text-muted hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-sr-text-muted mb-4">Read-only — for context on the reported message.</p>

        {error && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>}

        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 text-sr-purple animate-spin" /></div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-sr-text-muted text-center py-8">No messages found.</p>
          ) : (
            messages.map(m => {
              const sender = people[m.sender_id];
              const isHighlighted = m.id === highlightMessageId;
              return (
                <div key={m.id} className={`p-2.5 rounded-lg border ${isHighlighted ? 'bg-red-500/10 border-red-500/30' : 'bg-sr-surface border-sr-border'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-white">{sender ? fullName(sender as never) : 'Unknown'}</span>
                    {sender && <span className="text-[10px] text-sr-text-muted">@{sender.username}</span>}
                    <span className="text-[10px] text-sr-text-muted ml-auto">{timeAgo(m.created_at)}</span>
                    {isHighlighted && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-semibold">Reported</span>}
                  </div>
                  {m.content && <p className="text-xs text-sr-silver">{m.content}</p>}
                  {m.media_url && m.media_type === 'photo' && <img src={m.media_url} alt="" className="max-h-40 rounded mt-1" />}
                  {m.media_url && m.media_type === 'video' && <video src={m.media_url} controls className="max-h-40 rounded mt-1" />}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
