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

  // Read from conversation_participants.has_sent_message (SQL #95), not
  // from currently-existing `messages` rows. A hard "delete for
  // everyone" removes the message row but does NOT clear this flag (a
  // DB trigger sets it once and it stays set), so deleting your one
  // allowed message can't be used to reset the limit and send again.
  const { data: rows, error } = await supabase
    .from('conversation_participants')
    .select('profile_id, has_sent_message')
    .eq('conversation_id', conversationId)
    .in('profile_id', [currentProfileId, otherProfileId]);

  if (error) {
    console.error('[messageRequestRules] Failed to check message history:', error.message);
    // Fail open on a lookup error rather than silently blocking sends —
    // the DB-level trigger is the real backstop for abuse either way.
    return { allowed: true };
  }

  const theyReplied = (rows ?? []).some(r => r.profile_id === otherProfileId && r.has_sent_message);
  if (theyReplied) return { allowed: true };

  const iAlreadySent = (rows ?? []).some(r => r.profile_id === currentProfileId && r.has_sent_message);
  if (iAlreadySent) {
    return {
      allowed: false,
      reason: "You've already sent a message. Wait for them to reply before sending more.",
    };
  }

  return { allowed: true };
}
