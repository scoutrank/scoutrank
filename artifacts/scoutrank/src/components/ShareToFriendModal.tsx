import { useState, useEffect, useCallback } from 'react';
import { supabase, fullName } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase';
import { isConversationBlocked } from '@/lib/minorSafety';
import { canSendMessage } from '@/lib/messageRequestRules';
import { X, Loader2, Send, Check, Search } from 'lucide-react';

interface ShareToFriendModalProps {
  postId: string;
  currentProfile: Profile | null;
  open: boolean;
  onClose: () => void;
}

/**
 * "Send to a Friend" — by default only shows people you follow AND who
 * follow you back (mutuals). Anyone else has to be found via search, and
 * sending to them is subject to the message-request rule: one message,
 * then wait for a reply.
 */
export function ShareToFriendModal({ postId, currentProfile, open, onClose }: ShareToFriendModalProps) {
  const [mutuals, setMutuals] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !currentProfile) return;
    setLoading(true);
    setError(null);
    setSentTo(null);
    setQuery('');
    setSearchResults([]);

    (async () => {
      // Mutuals = people I follow AND who follow me back.
      const [iFollowRes, followMeRes] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', currentProfile.id),
        supabase.from('follows').select('follower_id').eq('following_id', currentProfile.id),
      ]);

      if (iFollowRes.error || followMeRes.error) {
        console.error('[ShareToFriendModal] Failed to load follows:', iFollowRes.error?.message ?? followMeRes.error?.message);
        setLoading(false);
        return;
      }

      const iFollowIds = new Set((iFollowRes.data ?? []).map(r => r.following_id));
      const followMeIds = new Set((followMeRes.data ?? []).map(r => r.follower_id));
      const mutualIds = [...iFollowIds].filter(id => followMeIds.has(id));

      if (mutualIds.length === 0) {
        setMutuals([]);
        setLoading(false);
        return;
      }

      // Only the fields actually used here are needed — select('*') was
      // pulling every profile column (including things like date_of_birth)
      // to the client for no reason. Keep 'age', 'role', and
      // 'coach_scout_verification_status' though: isConversationBlocked()
      // (called from handleSend below) needs them for the minor-safety
      // check, even though they're not rendered.
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, first_name, last_name, avatar_url, age, role, coach_scout_verification_status')
        .in('id', mutualIds);

      if (profilesError) console.error('[ShareToFriendModal] Failed to load mutual profiles:', profilesError.message);
      setMutuals((profiles as Profile[] | null) ?? []);
      setLoading(false);
    })();
  }, [open, currentProfile?.id]);

  const runSearch = useCallback((q: string) => {
    if (!currentProfile || !q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    // PostgREST treats commas and parens inside a .or() filter as
    // delimiters/grouping syntax, so a raw search term containing them
    // (e.g. "smith, john") broke the whole query silently — the .then()
    // below only console.errors, so the UI just showed "No one found."
    // Escaping with a backslash (PostgREST's own escape syntax, same fix
    // as DiscoverPage.tsx's search) keeps these as literal characters.
    const searchSafe = q.trim().replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    supabase
      .from('profiles')
      // Same minimal column set as the mutuals query above — only what's
      // rendered, plus what isConversationBlocked() needs for the minor
      // safety check in handleSend.
      .select('id, username, first_name, last_name, avatar_url, age, role, coach_scout_verification_status')
      .neq('id', currentProfile.id)
      .or(`username.ilike.%${searchSafe}%,first_name.ilike.%${searchSafe}%,last_name.ilike.%${searchSafe}%`)
      .limit(15)
      .then(({ data, error }) => {
        if (error) console.error('[ShareToFriendModal] Search failed:', error.message);
        setSearchResults((data as Profile[] | null) ?? []);
        setSearching(false);
      });
  }, [currentProfile?.id]);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const handleSend = async (friend: Profile) => {
    if (!currentProfile || sendingTo) return;

    if (isConversationBlocked(currentProfile, friend)) {
      setError('This conversation is not available. Unverified coaches and scouts cannot be contacted by users under 18.');
      return;
    }

    setSendingTo(friend.id);
    setError(null);

    const { data: conversationId, error: rpcError } = await supabase
      .rpc('find_or_create_direct_conversation', { other_profile_id: friend.id });

    if (rpcError || !conversationId) {
      console.error('[ShareToFriendModal] Failed to resolve conversation:', rpcError?.message);
      setError('Something went wrong. Please try again.');
      setSendingTo(null);
      return;
    }

    // Message-request rule: unless you follow each other, you get exactly
    // one message until they reply.
    const check = await canSendMessage(currentProfile.id, friend.id, conversationId as string);
    if (!check.allowed) {
      setError(check.reason ?? 'You cannot send another message yet.');
      setSendingTo(null);
      return;
    }

    const { error: sendError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: currentProfile.id,
      content: null,
      shared_post_id: postId,
    });

    setSendingTo(null);
    if (sendError) {
      console.error('[ShareToFriendModal] Failed to send:', sendError.message);
      setError('Something went wrong. Please try again.');
      return;
    }
    setSentTo(friend.id);
  };

  if (!open) return null;

  const showingSearch = query.trim().length > 0;
  const list = showingSearch ? searchResults : mutuals;
  const listLoading = showingSearch ? searching : loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm card-premium p-4 max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <h3 className="text-sm font-semibold text-white">Send to a Friend</h3>
          <button onClick={onClose} className="text-sr-text-muted hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mb-3 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sr-text-muted" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by username or name..."
            className="input-dark pl-8 py-1.5 text-xs w-full"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400 mb-2 flex-shrink-0">{error}</p>
        )}

        {!showingSearch && (
          <p className="text-[10px] uppercase tracking-wide text-sr-text-muted mb-1.5 flex-shrink-0">
            People who follow you back
          </p>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {listLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 text-sr-purple animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-8">
              {showingSearch ? (
                <p className="text-sm text-sr-text-muted">No one found matching "{query}".</p>
              ) : (
                <>
                  <p className="text-sm text-sr-text-muted">No mutual follows yet.</p>
                  <p className="text-xs text-sr-text-muted mt-1">Search above to send to anyone else.</p>
                </>
              )}
            </div>
          ) : (
            list.map(friend => (
              <button
                key={friend.id}
                onClick={() => handleSend(friend)}
                disabled={!!sendingTo || sentTo === friend.id}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-sr-surface-light transition-colors disabled:opacity-70"
              >
                <div className="h-9 w-9 rounded-full overflow-hidden bg-gradient-to-br from-sr-purple to-sr-blue flex-shrink-0">
                  {friend.avatar_url ? (
                    <img src={friend.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-white text-xs font-bold">
                      {friend.first_name?.[0]}{friend.last_name?.[0]}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-white truncate">{fullName(friend)}</p>
                  <p className="text-xs text-sr-text-muted truncate">@{friend.username}</p>
                </div>
                {sendingTo === friend.id ? (
                  <Loader2 className="h-4 w-4 text-sr-purple animate-spin flex-shrink-0" />
                ) : sentTo === friend.id ? (
                  <Check className="h-4 w-4 text-sr-success flex-shrink-0" />
                ) : (
                  <Send className="h-4 w-4 text-sr-text-muted flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
