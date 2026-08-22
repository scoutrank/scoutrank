import { supabase } from '@/lib/supabase';

export interface MessageCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Message-request rule (like Instagram DM requests):
 *  - Mutual follows (both follow each other) can message freely, no limit.
 *  - Otherwise, you get exactly ONE outbound message into a conversation —
 *    text, a shared post, anything — and then have to wait for them to
 *    reply before sending anything else. Once they've replied at least
 *    once, the conversation opens up and behaves like a normal one from
 *    then on (no further restriction, even after this check).
 */
export async function canSendMessage(
  currentProfileId: string,
  otherProfileId: string,
  conversationId: string | null,
): Promise<MessageCheckResult> {
  const [meFollowsThemRes, themFollowsMeRes] = await Promise.all([
    supabase.from('follows').select('follower_id')
      .eq('follower_id', currentProfileId).eq('following_id', otherProfileId).maybeSingle(),
    supabase.from('follows').select('follower_id')
      .eq('follower_id', otherProfileId).eq('following_id', currentProfileId).maybeSingle(),
  ]);

  const mutual = !!meFollowsThemRes.data && !!themFollowsMeRes.data;
  if (mutual) return { allowed: true };

  // Brand-new conversation (no id yet, e.g. first-ever message to this
  // person) — nothing sent yet either way, so the first message is fine.
  if (!conversationId) return { allowed: true };

  const { data: rows, error } = await supabase
    .from('messages')
    .select('sender_id')
    .eq('conversation_id', conversationId);

  if (error) {
    console.error('[messageRequestRules] Failed to check message history:', error.message);
    // Fail open on a lookup error rather than silently blocking sends —
    // the DB-level RLS/trigger layer is the real backstop for abuse.
    return { allowed: true };
  }

  const theyReplied = (rows ?? []).some(r => r.sender_id === otherProfileId);
  if (theyReplied) return { allowed: true };

  const iAlreadySent = (rows ?? []).some(r => r.sender_id === currentProfileId);
  if (iAlreadySent) {
    return {
      allowed: false,
      reason: "You've already sent a message. Wait for them to reply before sending more.",
    };
  }

  return { allowed: true };
}
