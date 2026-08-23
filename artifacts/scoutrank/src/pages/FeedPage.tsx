import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { uploadMediaBlob, kindFromMime } from '@/lib/mediaStorage';
import { triggerPostModeration } from '@/lib/postModeration';
import type { Post, Profile, PostComment, Conversation, Message } from '@/lib/supabase';
import { Button } from '@/components/ui/BrandButton';
import { SafeProfileLink } from '@/components/ui/SafeProfileLink';
import { isConversationBlocked } from '@/lib/minorSafety';
import { canSendMessage } from '@/lib/messageRequestRules';
import {
  recordAudioForSeconds,
} from '@/lib/store';
import { CameraCapture } from '@/components/CameraCapture';
import { ShareToFriendModal } from '@/components/ShareToFriendModal';
import { rankPosts } from '@/lib/feedRanking';
import {
  Send, Camera, Video, Mic,
  X, Play, Upload, MessageCircle, Users, Search, Plus,
  Loader2, StopCircle, Trash2, MoreVertical, ArrowLeft, Trophy,
  Volume2, VolumeX,
} from 'lucide-react';
import { CommentIcon, BookmarkIcon, ShareIcon, LinkIcon, ReactionIcon, ReactionIconById, MuscleIcon } from '@/components/icons';
import { MuscleReactionButton } from '@/components/MuscleReactionButton';

// Real post + embedded author profile (from `select('*, profiles(*)')`)
export type FeedPost = Post & { profiles: Profile };

// Resolves whether a post's media is a photo/video/audio. Prefers the
// real media_type column (set on every post created after SQL #30);
// falls back to sniffing the media_url's data: prefix only for posts
// created before that column existed (media_type is null on those) —
// this is what lets old base64 posts keep rendering correctly without
// any backfill.
function resolveMediaKind(mediaUrl: string | null, mediaType: 'photo' | 'video' | 'audio' | null): 'photo' | 'video' | 'audio' | null {
  if (mediaType) return mediaType;
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith('data:image')) return 'photo';
  if (mediaUrl.startsWith('data:video') || mediaUrl.startsWith('blob:')) return 'video';
  if (mediaUrl.startsWith('data:audio')) return 'audio';
  return null;
}

// ── Instagram-home-style inline autoplay for feed videos ──────────────────
// Only one video across the whole feed plays at a time, the same rule
// Explore/Reels uses — but here it's inline in the normal scroll list
// instead of a full-screen snap view, and playback follows scroll position
// automatically rather than a single "active card" index. A module-level
// singleton (rather than lifting state into FeedPage) keeps every
// FeedPostCard able to coordinate without threading an index/context
// through a long, independently-paginated list.
let activeAutoplayVideo: HTMLVideoElement | null = null;

// Marks a video as being paused/played by OUR autoplay logic (not the
// viewer tapping the native controls) so the pause/play listeners below
// can tell the difference — the flag lives on the element itself so it
// works even when a DIFFERENT card's effect is the one doing the pausing
// (handing off from the previously-active video to a newly-scrolled-into
// -view one).
function autoplayPause(video: HTMLVideoElement) {
  if (!video.paused) {
    (video as HTMLVideoElement & { __autoplayControlled?: boolean }).__autoplayControlled = true;
    video.pause();
  }
}
function autoplayPlay(video: HTMLVideoElement) {
  (video as HTMLVideoElement & { __autoplayControlled?: boolean }).__autoplayControlled = true;
  video.play().catch(() => {});
}

type FeedTab = 'home' | 'following';
type ViewMode = 'feed' | 'messages' | 'conversations';

// One row per conversation in the list — built from 3 batched queries
// (my participant rows, the other participant's profile, the latest
// message), not a single denormalized table.
type ConversationSummary = {
  conversationId: string;
  otherProfile: Profile;
  lastMessage: Message | null;
  unread: boolean;
};

export default function FeedPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [feedTab, setFeedTab] = useState<FeedTab>('home');
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const [showComposer, setShowComposer] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [followingIdsSet, setFollowingIdsSet] = useState<Set<string>>(new Set());
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [reactedByMe, setReactedByMe] = useState<Record<string, boolean>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [savedByMe, setSavedByMe] = useState<Record<string, boolean>>({});
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reportMessageCategory, setReportMessageCategory] = useState('');
  const [reportMessageReason, setReportMessageReason] = useState('');
  const [alsoBlockOnMessageReport, setAlsoBlockOnMessageReport] = useState(true);
  const [reportMessageError, setReportMessageError] = useState('');
  const [reportMessageSubmitted, setReportMessageSubmitted] = useState(false);
  const [reportMessageSubmitting, setReportMessageSubmitting] = useState(false);

  const submitMessageReport = async () => {
    if (!reportMessageId || !profile || !reportMessageCategory) { setReportMessageError('Please select a category.'); return; }
    setReportMessageSubmitting(true);
    setReportMessageError('');
    const target = messages.find(m => m.id === reportMessageId);
    const { error } = await supabase.from('reports').insert({
      reporter_id: profile.id,
      reported_profile_id: target?.sender_id ?? null,
      reported_message_id: reportMessageId,
      category: reportMessageCategory,
      reason: reportMessageReason.trim() || reportMessageCategory,
    });
    if (error) {
      setReportMessageSubmitting(false);
      setReportMessageError(error.message.includes('Rate limit') ? error.message.replace(/^.*Rate limit exceeded: /, '') : 'Could not submit report. Please try again.');
      return;
    }
    if (alsoBlockOnMessageReport && target?.sender_id && !blockedIds.has(target.sender_id)) {
      const { error: blockErr } = await supabase.from('blocked_users').insert({ blocker_id: profile.id, blocked_id: target.sender_id });
      if (!blockErr) setBlockedIds(prev => new Set(prev).add(target.sender_id));
    }
    setReportMessageSubmitting(false);
    setReportMessageSubmitted(true);
  };
  const [activeConversationProfile, setActiveConversationProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sharedPostsById, setSharedPostsById] = useState<Record<string, FeedPost>>({});
  const [sharingPost, setSharingPost] = useState<FeedPost | null>(null);
  const [isSendingSharedPost, setIsSendingSharedPost] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);

  // Load the set of profile IDs blocked by or blocking the current user.
  // Used to filter feed posts and prevent messaging.
  useEffect(() => {
    if (!profile) return;
    supabase.rpc('get_blocked_counterpart_ids').then(({ data, error }) => {
      if (error) return; // SQL #90 not yet applied — silently skip
      const ids = new Set<string>();
      for (const r of (data ?? []) as { profile_id: string }[]) ids.add(r.profile_id);
      setBlockedIds(ids);
    });
  }, [profile?.id]);

  // Kept separately from loadPosts' own per-tab follow fetch — this one
  // is specifically for re-ranking newly-arrived posts from realtime,
  // which needs to be available continuously, not just at initial load.
  useEffect(() => {
    if (!profile?.id) return;
    supabase.from('follows').select('following_id').eq('follower_id', profile.id).then(({ data }) => {
      setFollowingIdsSet(new Set(((data ?? []) as { following_id: string }[]).map(r => r.following_id)));
    });
  }, [profile?.id]);

  const loadPosts = (tab: FeedTab = 'home') => {
    setIsLoadingPosts(true);

    if (tab === 'following') {
      // Fetch IDs of profiles the current user follows, then load only their posts.
      if (!profile) { setPosts([]); setIsLoadingPosts(false); return; }
      supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', profile.id)
        .then(({ data: followData }) => {
          const followingIds = (followData ?? []).map((r: { following_id: string }) => r.following_id);
          if (followingIds.length === 0) { setPosts([]); setIsLoadingPosts(false); return; }
          supabase
            .from('posts')
            .select('*, profiles(*)')
            .in('profile_id', followingIds)
            .order('created_at', { ascending: false })
            .limit(50)
            .then(({ data, error }) => {
              if (error) console.error('Failed to load following posts:', error.message);
              const loaded = (data as unknown as FeedPost[] | null) ?? [];
              const visible = loaded.filter((p: FeedPost) => !blockedIds.has(p.profile_id));
              const ranked = rankPosts(
                visible.map(p => ({ ...p, reactionCount: 0, commentCount: 0 })),
                { viewerSport: profile.sport, followingIds: new Set(followingIds) },
              );
              setPosts(ranked);
              setIsLoadingPosts(false);
              loadReactionData(ranked);
            });
        });
      return;
    }

    // Home tab: all public posts, personalized ("For You" style) rather
    // than strict chronological — the Following tab above stays
    // chronological on purpose, since that's a deliberate list of
    // people you chose to follow and should behave predictably.
    Promise.all([
      supabase.from('posts').select('*, profiles(*)').order('created_at', { ascending: false }).limit(60),
      profile?.id ? supabase.from('follows').select('following_id').eq('follower_id', profile.id) : Promise.resolve({ data: [] }),
    ]).then(([{ data, error }, { data: followRows }]) => {
        if (error) console.error('Failed to load posts:', error.message);
        const loaded = (data as unknown as FeedPost[] | null) ?? [];
        const visible = loaded.filter((p: FeedPost) => !blockedIds.has(p.profile_id));
        const followingIds = new Set(((followRows ?? []) as { following_id: string }[]).map(r => r.following_id));
        const ranked = rankPosts(
          visible.map(p => ({ ...p, reactionCount: 0, commentCount: 0 })),
          { viewerSport: profile?.sport, followingIds, randomness: 0.6 },
        );
        setPosts(ranked);
        setIsLoadingPosts(false);
        loadReactionData(ranked);
      });
  };

  const loadReactionData = (loaded: FeedPost[]) => {
    if (loaded.length === 0) return;
    supabase.from('post_reactions').select('post_id, profile_id').in('post_id', loaded.map(p => p.id))
      .then(({ data: reactionRows, error: reactionError }) => {
        if (reactionError) { console.error('Failed to load reactions:', reactionError.message); return; }
        const counts: Record<string, number> = {};
        const myReacted: Record<string, boolean> = {};
        for (const row of (reactionRows as { post_id: string; profile_id: string }[] | null) ?? []) {
          counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
          if (row.profile_id === profile?.id) myReacted[row.post_id] = true;
        }
        setReactionCounts(counts);
        setReactedByMe(myReacted);
      });
    supabase.from('post_comments').select('post_id').in('post_id', loaded.map(p => p.id))
      .then(({ data: commentRows, error: commentError }) => {
        if (commentError) { console.error('Failed to load comment counts:', commentError.message); return; }
        const counts: Record<string, number> = {};
        for (const row of (commentRows as { post_id: string }[] | null) ?? []) {
          counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
        }
        setCommentCounts(counts);
      });
    if (profile?.id) {
      supabase.from('saved_posts').select('post_id').eq('profile_id', profile.id).in('post_id', loaded.map(p => p.id))
        .then(({ data: savedRows, error: savedError }) => {
          if (savedError) { console.error('Failed to load saved posts:', savedError.message); return; }
          const saved: Record<string, boolean> = {};
          for (const row of (savedRows as { post_id: string }[] | null) ?? []) saved[row.post_id] = true;
          setSavedByMe(saved);
        });
    }
  };


  // Re-fetch posts + reactions whenever the profile becomes available,
  // AND whenever the user switches back to the Feed view from Messages/
  // Conversations — otherwise remounted FeedPostCard instances re-seed
  // from whatever reactedByMe/reactionCounts last held, which can be
  // stale (a reaction made while this card was mounted only ever updated
  // its own local state, not this parent map).
  useEffect(() => {
    if (viewMode === 'feed') {
      loadPosts(feedTab);
    }
  }, [viewMode, profile?.id, feedTab]);

  // Live updates — a new post shows up at the top without needing a
  // reload, and a post that's deleted (by its owner or an admin)
  // disappears immediately for everyone currently viewing the feed.
  // Note: this always adds a new post to the visible list regardless of
  // the Home/Following tab distinction — a small simplification, since
  // properly respecting "Following" here would need re-checking the
  // follow list on every single new post.
  useEffect(() => {
    const channel = supabase
      .channel('feed-posts-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async payload => {
        const newPost = payload.new as { id: string; profile_id: string };
        if (blockedIds.has(newPost.profile_id)) return;
        const { data } = await supabase.from('posts').select('*, profiles(*)').eq('id', newPost.id).maybeSingle();
        if (!data) return;
        setPosts(prev => {
          if (prev.some(p => p.id === newPost.id)) return prev;
          const withNew = [data as unknown as FeedPost, ...prev];
          return rankPosts(
            withNew.map(p => ({ ...p, reactionCount: 0, commentCount: 0 })),
            { viewerSport: profile?.sport, followingIds: followingIdsSet, randomness: 0.6 },
          ) as FeedPost[];
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, payload => {
        const deletedId = (payload.old as { id?: string }).id;
        if (!deletedId) return;
        setPosts(prev => prev.filter(p => p.id !== deletedId));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [blockedIds, profile?.sport, followingIdsSet]);

  const loadConversations = () => {
    if (!profile) return;
    setIsLoadingConversations(true);

    supabase
      .from('conversation_participants')
      .select('conversation_id, last_read_at, hidden_at')
      .eq('profile_id', profile.id)
      .then(async ({ data: myParticipantRows, error: myError }) => {
        if (myError) { console.error('Failed to load conversations:', myError.message); setIsLoadingConversations(false); return; }
        const rows = myParticipantRows ?? [];
        const conversationIds = rows.map(r => r.conversation_id);
        if (conversationIds.length === 0) {
          setConversations([]);
          setIsLoadingConversations(false);
          return;
        }
        const lastReadByConversation: Record<string, string> = {};
        const hiddenAtByConversation: Record<string, string | null> = {};
        for (const r of rows) {
          lastReadByConversation[r.conversation_id] = r.last_read_at;
          hiddenAtByConversation[r.conversation_id] = r.hidden_at;
        }

        // The other participant in each (1:1 only, for now) conversation
        const otherParticipantsRes = await supabase
          .from('conversation_participants')
          .select('conversation_id, profiles(*)')
          .in('conversation_id', conversationIds)
          .neq('profile_id', profile.id);

        // Most recent message per conversation — fetched as a flat,
        // already-sorted list and reduced to "first per conversation_id"
        // client-side, same batching approach used elsewhere in this app.
        const messagesRes = await supabase
          .from('messages')
          .select('*')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });

        if (otherParticipantsRes.error) console.error('Failed to load conversation participants:', otherParticipantsRes.error.message);
        if (messagesRes.error) console.error('Failed to load latest messages:', messagesRes.error.message);

        const otherProfileByConversation: Record<string, Profile> = {};
        for (const row of (otherParticipantsRes.data as { conversation_id: string; profiles: Profile }[] | null) ?? []) {
          otherProfileByConversation[row.conversation_id] = row.profiles;
        }
        const lastMessageByConversation: Record<string, Message> = {};
        for (const m of (messagesRes.data as Message[] | null) ?? []) {
          if (!lastMessageByConversation[m.conversation_id]) lastMessageByConversation[m.conversation_id] = m;
        }

        const allSummaries: ConversationSummary[] = conversationIds
          .filter(id => otherProfileByConversation[id]) // skip if the other participant's profile failed to load
          .filter(id => {
            // "Delete chat for me" — hidden_at on my own participant row.
            // Reappears automatically once something newer than hidden_at
            // happens (no explicit "unhide" needed anywhere).
            const hiddenAt = hiddenAtByConversation[id];
            if (!hiddenAt) return true;
            const last = lastMessageByConversation[id];
            return !!last && new Date(last.created_at) > new Date(hiddenAt);
          })
          .map(id => {
            const last = lastMessageByConversation[id] ?? null;
            const unread = !!last && last.sender_id !== profile.id && new Date(last.created_at) > new Date(lastReadByConversation[id]);
            return { conversationId: id, otherProfile: otherProfileByConversation[id], lastMessage: last, unread };
          });

        // Defensive dedup by other-profile-id — SQL #29 prevents new
        // duplicates at the database level, but this guards the UI
        // against any that already existed before that migration ran
        // (or before its cleanup step is applied). Keeps whichever
        // duplicate has the most recent message.
        const bestByOtherProfile = new Map<string, ConversationSummary>();
        for (const s of allSummaries) {
          const existing = bestByOtherProfile.get(s.otherProfile.id);
          if (!existing || (s.lastMessage?.created_at ?? '') > (existing.lastMessage?.created_at ?? '')) {
            bestByOtherProfile.set(s.otherProfile.id, s);
          }
        }

        const summaries = Array.from(bestByOtherProfile.values())
          .sort((a, b) => {
            const at = a.lastMessage?.created_at ?? '';
            const bt = b.lastMessage?.created_at ?? '';
            return bt.localeCompare(at);
          });

        setConversations(summaries);
        setIsLoadingConversations(false);
      });
  };

  // "Delete chat for me" — hides it from my own inbox only. The other
  // participant's row/access is untouched. Removes it from local state
  // immediately rather than waiting on a refetch.
  const handleDeleteConversation = async (conversationId: string) => {
    if (!profile) return;
    if (!window.confirm("Delete this chat? It'll disappear from your inbox until the other person messages you again.")) return;
    setConversations(prev => prev.filter(c => c.conversationId !== conversationId));
    const { error } = await supabase
      .from('conversation_participants')
      .update({ hidden_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', profile.id);
    if (error) {
      console.error('Failed to delete conversation:', error.message);
      loadConversations(); // roll back the optimistic removal by refetching
    }
  };

  useEffect(() => {
    if (viewMode === 'messages' && !activeConversation) {
      loadConversations();
    }
  }, [viewMode, activeConversation, profile?.id]);

  const openConversation = async (conversationId: string, otherProfile: Profile) => {
    if (!profile) return;
    // Parents may only message their approved linked children.
    if (isParent) {
      const { data: link } = await supabase
        .from('parent_athlete_links')
        .select('id')
        .eq('parent_profile_id', profile.id)
        .eq('athlete_profile_id', otherProfile.id)
        .eq('status', 'approved')
        .maybeSingle();
      if (!link) {
        setDmError('Parents may only message their linked children.');
        setViewMode('messages');
        return;
      }
    }
    // Minor safety check — prevents opening a conversation with an
    // unverified coach/scout if the current user is (or may be) a minor.
    // This covers the conversation list click path.
    if (isConversationBlocked(profile as Profile, otherProfile)) {
      setDmError('This conversation is not available. Unverified coaches and scouts cannot be contacted by users under 18.');
      setViewMode('messages');
      return;
    }
    setActiveConversation(conversationId);
    setActiveConversationProfile(otherProfile);

    const [messagesRes, hiddenRes] = await Promise.all([
      supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
      supabase.from('message_hidden_for').select('message_id').eq('profile_id', profile.id),
    ]);
    if (messagesRes.error) console.error('Failed to load messages:', messagesRes.error.message);
    if (hiddenRes.error) console.error('Failed to load hidden messages:', hiddenRes.error.message);

    const hiddenIds = new Set((hiddenRes.data as { message_id: string }[] | null ?? []).map(h => h.message_id));
    // "Delete for me" — a message I've hidden for myself never shows
    // again for me, on refresh or otherwise, but is untouched for the
    // other participant (no row was removed, just my own hide record).
    const loadedMessages = ((messagesRes.data as Message[] | null) ?? []).filter(m => !hiddenIds.has(m.id));
    setMessages(loadedMessages);

    // Batched fetch for any shared-post previews in this thread — one
    // query for every shared message, not one query per message.
    const sharedPostIds = [...new Set(loadedMessages.filter(m => m.shared_post_id).map(m => m.shared_post_id as string))];
    if (sharedPostIds.length > 0) {
      const { data: sharedPosts, error: sharedError } = await supabase
        .from('posts')
        .select('*, profiles(*)')
        .in('id', sharedPostIds);
      if (sharedError) console.error('Failed to load shared post previews:', sharedError.message);
      const map: Record<string, FeedPost> = {};
      for (const p of (sharedPosts as unknown as FeedPost[] | null) ?? []) map[p.id] = p;
      setSharedPostsById(map);
    } else {
      setSharedPostsById({});
    }

    // Mark read immediately on opening, and reflect that in the list
    // locally so the unread badge clears without waiting for a refetch.
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', profile.id);
    setConversations(prev => prev.map(c => c.conversationId === conversationId ? { ...c, unread: false } : c));
  };

  // "Send to a Friend" — opens the picker over the existing conversation
  // list. Reuses ConversationsView as-is; only the onSelect behavior
  // differs (send instead of open).
  const handleOpenSharePicker = (post: FeedPost) => {
    setSharingPost(post);
  };

  const handleSendSharedPost = async (conversationId: string, otherProfile: Profile) => {
    if (!profile || !sharingPost || isSendingSharedPost) return;
    // Minor safety check.
    if (isConversationBlocked(profile as Profile, otherProfile)) {
      setDmError('This conversation is not available. Unverified coaches and scouts cannot be contacted by users under 18.');
      setSharingPost(null);
      setViewMode('messages');
      return;
    }
    setIsSendingSharedPost(true);

    // Routed through the same RPC used everywhere else a conversation is
    // opened/created — the picker only ever shows conversations that
    // already exist, so this will just immediately find and return the
    // same id, but keeps this path consistent if the picker is ever
    // extended to show people not yet messaged.
    const { data: confirmedConversationId, error } = await supabase
      .rpc('find_or_create_direct_conversation', { other_profile_id: otherProfile.id });
    if (error || !confirmedConversationId) {
      console.error('Failed to resolve conversation for shared post:', error?.message);
      setIsSendingSharedPost(false);
      return;
    }

    // Message-request rule: unless you follow each other, you get exactly
    // one message (of any kind) until they reply.
    const check = await canSendMessage(profile.id, otherProfile.id, confirmedConversationId as string);
    if (!check.allowed) {
      setDmError(check.reason ?? 'You cannot send another message yet.');
      setIsSendingSharedPost(false);
      return;
    }

    const { error: sendError } = await supabase.from('messages').insert({
      conversation_id: confirmedConversationId,
      sender_id: profile.id,
      content: null,
      shared_post_id: sharingPost.id,
    });
    setIsSendingSharedPost(false);
    if (sendError) {
      console.error('Failed to send shared post:', sendError.message);
      return;
    }

    const sentPost = sharingPost;
    setSharingPost(null);
    setViewMode('messages');
    await openConversation(confirmedConversationId as string, otherProfile);
    // openConversation's batched fetch already covers existing shared
    // messages, but the one we just sent might not have landed in that
    // query yet depending on timing — make sure its preview is available
    // immediately rather than waiting for the Realtime echo to resolve it.
    setSharedPostsById(prev => ({ ...prev, [sentPost.id]: sentPost }));
  };

  // Realtime: live message delivery for the currently open thread.
  useEffect(() => {
    if (!activeConversation || !profile) return;

    const channel = supabase
      .channel(`messages:${activeConversation}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeConversation}`,
      }, (payload) => {
        const newMessage = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === newMessage.id) ? prev : [...prev, newMessage]);
        if (newMessage.shared_post_id) {
          setSharedPostsById(prev => {
            if (prev[newMessage.shared_post_id as string]) return prev; // already have it
            supabase.from('posts').select('*, profiles(*)').eq('id', newMessage.shared_post_id).maybeSingle()
              .then(({ data: sharedPost, error: sharedError }) => {
                if (sharedError) { console.error('Failed to load shared post preview:', sharedError.message); return; }
                if (sharedPost) setSharedPostsById(p => ({ ...p, [sharedPost.id]: sharedPost as unknown as FeedPost }));
              });
            return prev;
          });
        }
        // The thread is actively open — mark read immediately if it's
        // not our own message bouncing back.
        if (newMessage.sender_id !== profile.id) {
          supabase
            .from('conversation_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', activeConversation)
            .eq('profile_id', profile.id)
            .then(() => {});
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConversation, profile?.id]);

  // Realtime: keep the conversation list (previews/unread) live even for
  // threads that aren't currently open. Broad subscription, filtered
  // client-side against known conversation ids — Realtime's postgres_changes
  // filter syntax doesn't support "IN (...)" lists.
  useEffect(() => {
    if (viewMode !== 'messages' || !profile) return;
    const myConversationIds = new Set(conversations.map(c => c.conversationId));

    const channel = supabase
      .channel('messages:list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessage = payload.new as Message;
        if (newMessage.conversation_id === activeConversation) return; // handled by the per-thread channel above
        if (!myConversationIds.has(newMessage.conversation_id)) return;
        setConversations(prev => prev.map(c =>
          c.conversationId === newMessage.conversation_id
            ? { ...c, lastMessage: newMessage, unread: newMessage.sender_id !== profile.id }
            : c
        ));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [viewMode, profile?.id, conversations.map(c => c.conversationId).join(',')]);

  const handleSendMessage = async (content: string) => {
    if (!profile || !activeConversation) return;
    // Parents may only message their approved linked children.
    if (isParent && activeConversationProfile) {
      const { data: link } = await supabase
        .from('parent_athlete_links')
        .select('id')
        .eq('parent_profile_id', profile.id)
        .eq('athlete_profile_id', activeConversationProfile.id)
        .eq('status', 'approved')
        .maybeSingle();
      if (!link) throw new Error('Parents may only message their linked children.');
    }
    // Minor safety check — prevents sending if the partner's verification
    // status changed since the conversation was opened (e.g. revoked).
    if (activeConversationProfile && isConversationBlocked(profile as Profile, activeConversationProfile)) {
      throw new Error('This conversation is not available. Unverified coaches and scouts cannot be contacted by users under 18.');
    }
    // Block check — DB trigger is the real backstop, but surface it clearly in the UI.
    if (activeConversationProfile && blockedIds.has(activeConversationProfile.id)) {
      throw new Error('Messaging is not available between these accounts.');
    }
    // Message-request rule: unless you follow each other, you get exactly
    // one message until they reply.
    if (activeConversationProfile) {
      const check = await canSendMessage(profile.id, activeConversationProfile.id, activeConversation);
      if (!check.allowed) throw new Error(check.reason ?? 'You cannot send another message yet.');
    }
    const { error } = await supabase
      .from('messages')
      .insert({ conversation_id: activeConversation, sender_id: profile.id, content });
    if (error) {
      console.error('Failed to send message:', error.message);
      // Now that message_permission is enforced on every send (not just
      // on opening a conversation), a previously-fine, already-active
      // conversation can start rejecting sends if the recipient changes
      // their setting — this needs to actually reach the user, not just
      // the console, or a blocked message looks like it silently vanished.
      throw new Error(error.message);
    }
    // Deliberately not appending locally — the Realtime subscription
    // above is the single source of truth for what shows in the thread,
    // including our own messages. Keeps one path, not two.
  };

  // "Delete for me" — anyone in the conversation can do this, for any
  // message including ones they didn't send. Only hides it for them;
  // the other participant is completely unaffected.
  const handleDeleteMessageForMe = async (messageId: string) => {
    if (!profile) return;
    setMessages(prev => prev.filter(m => m.id !== messageId));
    const { error } = await supabase
      .from('message_hidden_for')
      .insert({ message_id: messageId, profile_id: profile.id });
    if (error) {
      console.error('Failed to hide message:', error.message);
      if (activeConversation && activeConversationProfile) openConversation(activeConversation, activeConversationProfile); // roll back by refetching
    }
  };

  // "Delete for everyone" — sender-only hard delete (enforced by
  // messages_delete_own RLS regardless of this .eq, which is just to
  // avoid a wasted round-trip on an attempt that would fail anyway).
  const handleDeleteMessageForEveryone = async (messageId: string) => {
    if (!profile) return;
    if (!window.confirm('Delete this message for everyone? This cannot be undone.')) return;
    setMessages(prev => prev.filter(m => m.id !== messageId));
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', profile.id);
    if (error) {
      console.error('Failed to delete message:', error.message);
      if (activeConversation && activeConversationProfile) openConversation(activeConversation, activeConversationProfile);
    }
  };

  // Deep link from "Message" on an athlete's profile: /feed?dm=<profileId>
  // Guarded by a ref (not just removing the param) — React 18 StrictMode
  // double-invokes effects in development, and removing the search param
  // is itself an async state update, so without this guard the RPC could
  // fire twice before the param-removal re-render lands, racing itself
  // into creating two conversations. The DB-level fix (SQL #29) is the
  // real backstop; this just avoids triggering the race in the first place.
  const dmHandledRef = useRef<string | null>(null);
  useEffect(() => {
    const dmTarget = searchParams.get('dm');
    if (!dmTarget || !profile) return;
    if (dmHandledRef.current === dmTarget) return;
    dmHandledRef.current = dmTarget;
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('dm'); return next; }, { replace: true });

    (async () => {
      // Load the target profile first so we can safety-check before
      // creating or opening a conversation.
      const { data: dmTargetProfile, error: dmProfileError } = await supabase
        .from('profiles').select('*').eq('id', dmTarget).maybeSingle();
      if (dmProfileError || !dmTargetProfile) {
        console.error('Failed to load DM target profile:', dmProfileError?.message);
        setDmError('Could not start this conversation.');
        setViewMode('messages');
        return;
      }

      // Minor safety check — blocks both directions.
      if (isConversationBlocked(profile as Profile, dmTargetProfile as Profile)) {
        setDmError(
          'This conversation is not available. Unverified coaches and scouts cannot be contacted by users under 18.'
        );
        setViewMode('messages');
        return;
      }

      // Blocking check — blocked users cannot message each other.
      if (blockedIds.has(dmTarget)) {
        setDmError('Messaging is not available between these accounts.');
        setViewMode('messages');
        return;
      }

      const { data: conversationId, error } = await supabase
        .rpc('find_or_create_direct_conversation', { other_profile_id: dmTarget });
      if (error || !conversationId) {
        console.error('Failed to start conversation:', error?.message);
        setDmError(error?.message || 'Could not start this conversation.');
        setViewMode('messages');
        return;
      }
      setViewMode('messages');
      openConversation(conversationId as string, dmTargetProfile as Profile);
    })();
  }, [searchParams, profile?.id]);

  // Deep link from a notification (message/shared post): /feed?conversation=<conversationId>
  // Purely additive — opens an already-known conversation_id directly,
  // unlike ?dm= above which finds-or-creates by the OTHER PERSON's id.
  // A notification already has the real conversation_id, so there's no
  // need to go through find_or_create_direct_conversation here at all.
  const conversationHandledRef = useRef<string | null>(null);
  useEffect(() => {
    const conversationTarget = searchParams.get('conversation');
    if (!conversationTarget || !profile) return;
    if (conversationHandledRef.current === conversationTarget) {
      return;
    }
    conversationHandledRef.current = conversationTarget;
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('conversation'); return next; }, { replace: true });

    supabase
      .from('conversation_participants')
      .select('profiles(*)')
      .eq('conversation_id', conversationTarget)
      .neq('profile_id', profile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { console.error('Failed to open conversation from notification:', error?.message); return; }
        const otherProfile = (data as { profiles: Profile }).profiles;
        // Minor safety check — same rule as profile viewing.
        // Prevents a minor from reaching an unverified coach/scout's
        // chat by tapping a notification, bypassing the profile gate.
        if (isConversationBlocked(profile as Profile, otherProfile as Profile)) {
          console.warn('[minor-safety] notification deep-link blocked — conversation between minor and unverified coach/scout');
          setDmError(
            'This conversation is not available. Unverified coaches and scouts cannot be contacted by users under 18.'
          );
          setViewMode('messages');
          return;
        }
        setViewMode('messages');
        openConversation(conversationTarget, otherProfile);
      });
  }, [searchParams, profile?.id]);

  if (!profile) return null;
  const isParent = profile.role === 'parent';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Community</h1>
        <div className="flex bg-sr-surface rounded-xl p-1 gap-1">
          {viewMode === 'feed' && [
            { id: 'home' as const, label: 'Home' },
            { id: 'following' as const, label: 'Following' },
          ].map(t => (
            <button key={t.id} onClick={() => setFeedTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                feedTab === t.id ? 'bg-sr-purple text-white' : 'text-sr-text-muted hover:text-white'
              }`}>{t.label}</button>
          ))}
          <button onClick={() => { setViewMode(viewMode === 'messages' ? 'feed' : 'messages'); setActiveConversation(null); setActiveConversationProfile(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              viewMode === 'messages' ? 'bg-sr-purple text-white' : 'text-sr-text-muted hover:text-white'
            } ${isParent ? 'hidden' : ''}`}>
            <MessageCircle className="h-3.5 w-3.5" />
            {viewMode === 'messages' ? 'Feed' : 'Messages'}
          </button>
        </div>
      </div>

      {viewMode === 'feed' ? (
        <>
          {/* Compose button — hidden for parents */}
          {!isParent && (
          <button onClick={() => setShowComposer(!showComposer)}
            className="w-full card-premium p-4 text-left hover:border-sr-purple/30 transition-all mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {profile.first_name?.[0]}{profile.last_name?.[0]}
              </div>
              <span className="text-sm text-sr-text-muted flex-1">What's happening in your sport?</span>
              <div className="flex items-center gap-1">
                <span className="p-1.5 text-sr-text-muted hover:text-white"><Camera className="h-4 w-4" /></span>
                <span className="p-1.5 text-sr-text-muted hover:text-white"><Video className="h-4 w-4" /></span>
                <span className="p-1.5 text-sr-text-muted hover:text-white"><Mic className="h-4 w-4" /></span>
              </div>
            </div>
          </button>
          )} {/* end !isParent compose button */}

          {showComposer && (
            <PostComposer profile={profile} onClose={() => setShowComposer(false)}
              onPost={async (content, media, mediaType) => {

                // GUARD: never persist a blob: URL — it only resolves
                // inside the tab that created it and is unrecoverable
                // for any other account or after refresh. No remaining
                // code path should ever produce one now that media goes
                // through real Storage uploads, but this stays as a
                // safety net.
                if (media && media.startsWith('blob:')) {
                  console.error('[media guard] Refusing to save post: media_url starts with blob: instead of a real URL. Value:', media.slice(0, 80));
                  throw new Error('This media could not be saved. Please try recording or uploading it again.');
                }

                // Belt-and-suspenders: UI is already hidden for parents
                // but block at the action level too.
                if (isParent) throw new Error('Parent accounts cannot create posts.');

                const { data: insertedPost, error } = await supabase.from('posts').insert({
                  profile_id: profile.id,
                  caption: content,
                  media_url: media || null,
                  media_type: mediaType || null,
                  sport_tag: null,
                }).select('id').single();
                if (error) {
                  console.error('Failed to create post:', error.message);
                  throw error;
                }
                if (insertedPost) triggerPostModeration((insertedPost as { id: string }).id, media || null, mediaType || null);
                setShowComposer(false);
                loadPosts(feedTab);
              }} />
          )}

          {/* Posts */}
          <div className="space-y-4">
            {isLoadingPosts ? (
              <div className="card-premium p-12 text-center">
                <Loader2 className="h-6 w-6 mx-auto text-sr-purple animate-spin" />
              </div>
            ) : posts.length === 0 ? (
              <div className="card-premium p-12 text-center">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-7 w-7 text-sr-purple-light" />
                </div>
                {feedTab === 'following' ? (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">You're not following anyone yet</h3>
                    <p className="text-sm text-sr-text-muted mb-6 max-w-xs mx-auto">
                      Follow athletes, coaches and scouts to see their posts here.
                    </p>
                    <Link to="/discover">
                      <Button variant="brand" size="sm" icon={<Search className="h-4 w-4" />}>
                        Discover athletes
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">Your feed is empty</h3>
                    <p className="text-sm text-sr-text-muted mb-6 max-w-xs mx-auto">
                      Follow athletes, coaches and scouts to see their posts, stats and achievements here.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Link to="/discover">
                        <Button variant="brand" size="sm" icon={<Search className="h-4 w-4" />}>
                          Discover athletes
                        </Button>
                      </Link>
                      <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />}
                        onClick={() => { setViewMode('feed'); }}>
                        Share an update
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              posts.map(post => (
                <FeedPostCard
                  key={post.id}
                  post={post}
                  currentProfileId={profile.id}
                  currentProfileName={fullName(profile)}
                  currentProfileUsername={profile.username}
                  currentProfileAvatar={`${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`}
                  viewerProfile={profile}
                  initialReactionCount={reactionCounts[post.id] ?? 0}
                  initialReacted={!!reactedByMe[post.id]}
                  initialCommentCount={commentCounts[post.id] ?? 0}
                  initialSaved={!!savedByMe[post.id]}
                  onPostDeleted={(postId) => setPosts(prev => prev.filter(p => p.id !== postId))}
                  onShareToAthlete={handleOpenSharePicker}
                />
              ))
            )}
          </div>
        </>
      ) : (
        activeConversation && activeConversationProfile ? (
          <ChatView
            currentProfile={profile}
            otherProfile={activeConversationProfile}
            messages={messages}
            sharedPostsById={sharedPostsById}
            blockedIds={blockedIds}
            onBack={() => { setActiveConversation(null); setActiveConversationProfile(null); }}
            onSend={handleSendMessage}
            onDeleteForMe={handleDeleteMessageForMe}
            onDeleteForEveryone={handleDeleteMessageForEveryone}
            onReportMessage={(id) => { setReportMessageId(id); setReportMessageCategory(''); setReportMessageReason(''); setAlsoBlockOnMessageReport(true); setReportMessageError(''); }}
          />
        ) : (
          <>
            {dmError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start justify-between gap-2">
                <span>{dmError}</span>
                <button onClick={() => setDmError(null)} className="flex-shrink-0"><X className="h-4 w-4" /></button>
              </div>
            )}
            <ConversationsView
              conversations={conversations}
              isLoading={isLoadingConversations}
              onSelect={openConversation}
              onDelete={handleDeleteConversation}
            />
          </>
        )
      )}

      {/* "Send to a Friend" — same component Explore uses, so behavior is
          identical: mutuals shown by default, full search for anyone else. */}
      {sharingPost && (
        <ShareToFriendModal
          postId={sharingPost.id}
          currentProfile={profile as Profile | null}
          open={!!sharingPost}
          onClose={() => setSharingPost(null)}
        />
      )}

      {reportMessageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setReportMessageId(null); setReportMessageSubmitted(false); setReportMessageReason(''); }}>
          <div className="w-full max-w-sm card-premium p-5" onClick={e => e.stopPropagation()}>
            {reportMessageSubmitted ? (
              <>
                <h3 className="text-sm font-semibold text-white mb-2">Report submitted</h3>
                <p className="text-xs text-sr-text-muted mb-4">Our team will review this message.</p>
                <button onClick={() => { setReportMessageId(null); setReportMessageSubmitted(false); setReportMessageCategory(''); setReportMessageReason(''); }}
                  className="w-full text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">Done</button>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-white mb-1">Report Message</h3>
                <p className="text-xs text-sr-text-muted mb-4">Select why this message is a problem.</p>
                {reportMessageError && (
                  <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{reportMessageError}</div>
                )}
                <div className="space-y-1.5 mb-3">
                  {[
                    ['harassment', 'Harassment or bullying'],
                    ['inappropriate_content', 'Inappropriate content'],
                    ['underage_safety', 'Safety concern about a minor'],
                    ['spam', 'Spam'],
                    ['other', 'Other'],
                  ].map(([value, label]) => (
                    <button key={value} onClick={() => setReportMessageCategory(value)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs border transition-all ${
                        reportMessageCategory === value ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="block text-xs text-sr-text-muted mb-1">Additional details (optional)</label>
                <textarea value={reportMessageReason} onChange={e => setReportMessageReason(e.target.value)} rows={2}
                  className="input-dark w-full resize-none text-sm mb-3" placeholder="Anything else that would help us review this?" />
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={alsoBlockOnMessageReport} onChange={e => setAlsoBlockOnMessageReport(e.target.checked)} />
                  <span className="text-xs text-sr-text-muted">Also block this person so they can't message you</span>
                </label>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setReportMessageId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">Cancel</button>
                  <button onClick={submitMessageReport} disabled={reportMessageSubmitting || !reportMessageCategory}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                    {reportMessageSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Submit Report
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

// ══════════════════════════════════════════════════
// POST COMPOSER with real media upload & capture
// ═══════════════════════════════════════════════════
interface PostComposerProps {
  profile: any;
  onClose: () => void;
  onPost: (content: string, media?: string, mediaType?: string) => Promise<void>;
}

function PostComposer({ profile, onClose, onPost }: PostComposerProps) {
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video' | 'audio' | null>(null);
  const [capturing, setCapturing] = useState<'photo' | 'video' | 'audio' | null>(null);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
      setError('Please upload a photo, video, or audio file.');
      return;
    }
    setError('');
    setIsUploadingFile(true);
    try {
      const kind = kindFromMime(file.type);
      const url = await uploadMediaBlob(file, profile.id, kind);
      setMedia(url);
      setMediaType(kind);
    } catch (err) {
      console.error('File upload failed:', err);
      setError(err instanceof Error ? err.message : 'Could not upload this file. Please try again.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const [cameraModal, setCameraModal] = useState<'photo' | 'video' | null>(null);

  const handleCameraCapture = (url: string) => {
    const mode = cameraModal;
    setCameraModal(null);
    if (!mode) return;
    setMedia(url);
    setMediaType(mode === 'photo' ? 'photo' : 'video');
  };

  const handleRecordAudio = async () => {
    setError('');
    setCapturing('audio');
    setIsRecording(true);
    try {
      const url = await recordAudioForSeconds(profile.id, 10);
      setMedia(url);
      setMediaType('audio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record audio. Please check permissions or use file upload.');
    } finally {
      setCapturing(null);
      setIsRecording(false);
    }
  };

  const clearMedia = () => { setMedia(null); setMediaType(null); setError(''); };

  const submit = async () => {
    if ((!content.trim() && !media) || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      await onPost(content, media || undefined, mediaType || undefined);
      // On success, the parent closes/unmounts this composer — no need
      // to reset isSubmitting here. If onPost resolves without closing
      // (shouldn't happen in the current flow, but defensive either
      // way), the guard below still re-enables the button.
    } catch (err) {
      console.error('Failed to create post:', err);
      const msg = err instanceof Error ? err.message : '';
      setError(msg.includes('Rate limit') ? msg.replace(/^.*Rate limit exceeded: /, '') : 'Something went wrong posting this. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card-premium p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Create Post</h3>
        <button onClick={onClose} className="text-sr-text-muted hover:text-white"><X className="h-4 w-4" /></button>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
      )}

      <div className="flex gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
          {profile.first_name?.[0]}{profile.last_name?.[0]}
        </div>
        <textarea value={content} onChange={e => setContent(e.target.value)}
          className="flex-1 input-dark text-sm resize-none min-h-[80px]"
          placeholder="Share your update..." />
      </div>

      {/* Media preview */}
      {media && (
        <div className="mb-3 relative rounded-xl overflow-hidden bg-sr-surface border border-sr-border">
          {mediaType === 'photo' && <img src={media} alt="" className="w-full max-h-64 object-cover" />}
          {mediaType === 'video' && <video src={media} controls className="w-full max-h-64" />}
          {mediaType === 'audio' && (
            <div className="p-4">
              <audio src={media} controls className="w-full" />
            </div>
          )}
          <button onClick={clearMedia} className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Capturing / uploading indicator */}
      {(capturing || isUploadingFile) && (
        <div className="mb-3 p-4 rounded-xl bg-sr-surface border border-sr-border text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-white mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-sr-purple" />
            {isUploadingFile ? 'Uploading...' : 'Recording audio (10s)...'}
          </div>
          {isRecording && <p className="text-xs text-sr-text-muted">Recording will stop automatically</p>}
        </div>
      )}

      {cameraModal && (
        <CameraCapture
          mode={cameraModal}
          profileId={profile.id}
          allowPause
          maxSeconds={60}
          onCapture={handleCameraCapture}
          onClose={() => setCameraModal(null)}
        />
      )}

      {/* Media options */}
      <div className="flex items-center justify-between pt-3 border-t border-sr-border">
        <div className="flex items-center gap-1">
          <button onClick={() => fileInputRef.current?.click()} disabled={isUploadingFile}
            className="p-2 text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors disabled:opacity-40" title="Upload file">
            <Upload className="h-4 w-4" />
          </button>
          <button onClick={() => setCameraModal('photo')} disabled={!!capturing}
            className="p-2 text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors disabled:opacity-40" title="Take photo">
            <Camera className="h-4 w-4" />
          </button>
          <button onClick={() => setCameraModal('video')} disabled={!!capturing}
            className="p-2 text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors disabled:opacity-40" title="Record video">
            <Video className="h-4 w-4" />
          </button>
          <button onClick={handleRecordAudio} disabled={!!capturing}
            className="p-2 text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors disabled:opacity-40" title="Record audio">
            {capturing === 'audio' ? <StopCircle className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4" />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" onChange={handleFileUpload} className="hidden" />
        </div>
        <Button variant="brand" size="sm" icon={isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          disabled={(!content.trim() && !media) || isSubmitting} onClick={submit}>
          {isSubmitting ? 'Posting...' : 'Post'}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// FEED POST CARD
// ═══════════════════════════════════════════════════
interface FeedPostCardProps {
  post: FeedPost;
  currentProfileId: string;
  currentProfileName: string;
  currentProfileUsername: string;
  currentProfileAvatar: string;
  viewerProfile: Pick<Profile, 'id' | 'age'> | null;
  initialReactionCount: number;
  initialReacted: boolean;
  initialCommentCount: number;
  initialSaved: boolean;
  onPostDeleted: (postId: string) => void;
  onShareToAthlete?: (post: FeedPost) => void;
  // Set when arriving from a comment/reply notification — auto-expands
  // the comment thread and scrolls to + highlights this specific one.
  highlightCommentId?: string | null;
}

export function FeedPostCard({
  post, currentProfileId, currentProfileName, currentProfileUsername, currentProfileAvatar,
  viewerProfile,
  initialReactionCount, initialReacted, initialCommentCount, initialSaved, onPostDeleted, onShareToAthlete,
  highlightCommentId,
}: FeedPostCardProps) {
  const [showComments, setShowComments] = useState(!!highlightCommentId);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<(PostComment & { profiles: Profile })[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isPostingReply, setIsPostingReply] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [savePending, setSavePending] = useState(false);
  const [reacted, setReacted] = useState(initialReacted);
  const [reactionCount, setReactionCount] = useState(initialReactionCount);
  const [reactionPending, setReactionPending] = useState(false);
  const feedVideoRef = useRef<HTMLVideoElement>(null);
  const mediaKind = resolveMediaKind(post.media_url, post.media_type);
  // True once the viewer has explicitly paused this video (tapping it) —
  // scrolling it back into view then leaves it paused instead of forcing
  // it to resume, same courtesy Explore/Reels gives. Mirrored into state
  // (below) purely so the paused-icon overlay can re-render on change.
  const userPausedVideoRef = useRef(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);

  const loadComments = () => {
    setIsLoadingComments(true);
    supabase
      .from('post_comments')
      .select('*, profiles(*)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true }) // oldest first
      .then(({ data, error }) => {
        if (error) console.error('Failed to load comments:', error.message);
        const loaded = (data as unknown as (PostComment & { profiles: Profile })[] | null) ?? [];
        setComments(loaded);
        setCommentCount(loaded.length);
        setIsLoadingComments(false);
      });
  };

  // `useState(!!highlightCommentId)` above only seeds state on first
  // mount. If this card gets reused for a different post/notification
  // without a full remount (React Router re-rendering PostDetailPage in
  // place rather than remounting it), showComments would keep whatever
  // value it was left at instead of re-opening for the new target —
  // same bug class already fixed for reactions/comment counts elsewhere
  // in this file. Force it open whenever a new highlight target arrives.
  useEffect(() => {
    if (highlightCommentId) {
      setShowComments(true);
      loadComments();
    }
  }, [highlightCommentId]);

  // Lazy-load comments the first time the thread is expanded, rather
  // than fetching for every post in the feed up front.
  useEffect(() => {
    if (showComments) loadComments();
  }, [showComments, post.id]);

  // Scroll to + briefly highlight the specific comment/reply a
  // notification deep-linked to, once it's actually present in the DOM.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightCommentId || comments.length === 0) return;
    const exists = comments.some(c => c.id === highlightCommentId);
    if (!exists) return; // comment may belong to a different post if the id was stale/wrong — don't highlight nothing
    const el = document.getElementById(`comment-${highlightCommentId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(highlightCommentId);
    const timer = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(timer);
  }, [comments, highlightCommentId]);

  // Same remount-staleness issue as reactions (see that fix above) —
  // resync the collapsed count whenever the parent's batched fetch lands.
  useEffect(() => {
    setCommentCount(initialCommentCount);
  }, [initialCommentCount]);

  // `useState(initialReacted)` only seeds state on first mount — the
  // parent loads posts first, then resolves the batched reactions query
  // slightly later, so every card initially mounts with `initialReacted
  // = false` and never re-syncs once the real value arrives. This effect
  // fixes that: re-sync local state whenever the parent's real data
  // actually lands (point 5 — correct on-load reacted state).
  useEffect(() => {
    setReacted(initialReacted);
    setReactionCount(initialReactionCount);
  }, [initialReacted, initialReactionCount]);

  // Instagram-home-style autoplay: this video plays (muted, looping) once
  // scrolled far enough into view, pauses once scrolled away, and only one
  // video across the whole feed plays at a time (activeAutoplayVideo, module
  // scope above) — same rule as Explore/Reels, but inline rather than
  // full-screen. Also pauses on tab-switch and resumes on return.
  useEffect(() => {
    const video = feedVideoRef.current;
    if (!video || mediaKind !== 'video') return;

    // Muted once on mount, imperatively — required for the browser to allow
    // autoplay without a prior tap. Deliberately not a JSX `muted` prop:
    // this card re-renders often (comments, reactions, etc.) and React
    // re-applies `muted` on every render, which would keep re-muting a
    // video the viewer had just manually unmuted via the native controls.
    video.muted = true;

    const onPause = () => {
      const el = video as HTMLVideoElement & { __autoplayControlled?: boolean };
      if (el.__autoplayControlled) el.__autoplayControlled = false;
      else userPausedVideoRef.current = true;
      setVideoPaused(true);
    };
    const onPlay = () => {
      const el = video as HTMLVideoElement & { __autoplayControlled?: boolean };
      if (el.__autoplayControlled) el.__autoplayControlled = false;
      else userPausedVideoRef.current = false;
      setVideoPaused(false);
    };
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (userPausedVideoRef.current) return;
          if (activeAutoplayVideo && activeAutoplayVideo !== video) autoplayPause(activeAutoplayVideo);
          activeAutoplayVideo = video;
          autoplayPlay(video);
        } else {
          if (activeAutoplayVideo === video) activeAutoplayVideo = null;
          autoplayPause(video);
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(video);

    // Switching browser tabs pauses this post's video (if it's playing) and
    // resumes from the same spot when you come back — same as Explore/Reels.
    let pausedByVisibility = false;
    const handleVisibility = () => {
      if (document.hidden) {
        if (!video.paused) { autoplayPause(video); pausedByVisibility = true; }
      } else if (pausedByVisibility) {
        pausedByVisibility = false;
        if (!userPausedVideoRef.current) autoplayPlay(video);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      obs.disconnect();
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (activeAutoplayVideo === video) activeAutoplayVideo = null;
    };
  }, [mediaKind]);

  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const [burstOrigin, setBurstOrigin] = useState({ x: 0, y: 0 });

  const handleDoubleTapLike = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setBurstOrigin({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setBurstKey(k => k + 1);
    setShowLikeBurst(true);
    setTimeout(() => setShowLikeBurst(false), 800);
    if (!reacted && !reactionPending && viewerProfile?.role !== 'parent') {
      supabase.from('post_reactions').select('id').eq('post_id', post.id).eq('profile_id', currentProfileId).maybeSingle()
        .then(({ data: existing }) => {
          if (existing) return; // already reacted server-side, nothing to do
          supabase.from('post_reactions').insert({ post_id: post.id, profile_id: currentProfileId, type: 'strength' })
            .then(({ error }) => {
              if (error) { console.error('Failed to add reaction:', error.message); return; }
              setReacted(true);
              setReactionCount(c => c + 1);
            });
        });
    }
  };

  // Single tap toggles play/pause (video only) instead of relying on the
  // native <video controls> bar — which is gone now (see the video element
  // below) since it was intercepting taps with its own skip ±10s/expand-to
  // -fullscreen/scrub buttons instead of letting a tap reach this handler
  // at all. A second tap within 300ms cancels the pending single-tap and
  // reacts instead, same split Explore/Reels uses for its cards.
  const lastTapRef = useRef(0);
  const singleTapTimeoutRef = useRef<number | null>(null);
  const handleTapMedia = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    const sinceLastTap = now - lastTapRef.current;
    lastTapRef.current = now;

    if (sinceLastTap < 300) {
      if (singleTapTimeoutRef.current) {
        window.clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
      handleDoubleTapLike(e);
      return;
    }

    singleTapTimeoutRef.current = window.setTimeout(() => {
      singleTapTimeoutRef.current = null;
      if (mediaKind !== 'video') return;
      const video = feedVideoRef.current;
      if (!video) return;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    }, 300);
  };

  // Real boost (💪) — "safe" toggle: ask the database what's actually
  // there right before acting, instead of trusting local/prop state,
  // which is what was causing 409 duplicate-key errors when local state
  // said "not reacted" but a row already existed.
  const handleReact = async () => {
    if (reactionPending) return;
    if (viewerProfile?.role === 'parent') return; // parents are read-only
    setReactionPending(true);

    const { data: existing, error: checkError } = await supabase
      .from('post_reactions')
      .select('id')
      .eq('post_id', post.id)
      .eq('profile_id', currentProfileId)
      .maybeSingle();

    if (checkError) {
      console.error('Failed to check reaction state:', checkError.message);
      setReactionPending(false);
      return;
    }

    if (existing) {
      const { error } = await supabase.from('post_reactions').delete().eq('id', existing.id);
      if (error) {
        console.error('Failed to remove reaction:', error.message);
      } else {
        setReacted(false);
        setReactionCount(c => Math.max(0, c - 1));
      }
    } else {
      const { error } = await supabase
        .from('post_reactions')
        .insert({ post_id: post.id, profile_id: currentProfileId, type: 'strength' });
      if (error) {
        console.error('Failed to add reaction:', error.message);
      } else {
        setReacted(true);
        setReactionCount(c => c + 1);
      }
    }

    setReactionPending(false);
  };

  // Same remount-staleness fix as reactions/comments — resync whenever
  // the parent's batched fetch lands.
  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  const handleSave = async () => {
    if (savePending) return;
    setSavePending(true);

    const { data: existing, error: checkError } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('post_id', post.id)
      .eq('profile_id', currentProfileId)
      .maybeSingle();

    if (checkError) {
      console.error('Failed to check saved state:', checkError.message);
      setSavePending(false);
      return;
    }

    if (existing) {
      const { error } = await supabase.from('saved_posts').delete().eq('id', existing.id);
      if (error) console.error('Failed to unsave post:', error.message);
      else setSaved(false);
    } else {
      const { error } = await supabase
        .from('saved_posts')
        .insert({ post_id: post.id, profile_id: currentProfileId });
      if (error) console.error('Failed to save post:', error.message);
      else setSaved(true);
    }

    setSavePending(false);
  };

  const handleComment = async () => {
    if (!comment.trim() || isPostingComment) return;
    if (viewerProfile?.role === 'parent') return; // parents are read-only
    setIsPostingComment(true);
    const content = comment;
    const { error } = await supabase
      .from('post_comments')
      .insert({ post_id: post.id, profile_id: currentProfileId, content });
    setIsPostingComment(false);
    if (error) {
      console.error('Failed to post comment:', error.message);
      return;
    }
    setComment('');
    loadComments(); // refetch so the new comment shows with real author info + ordering
  };

  const handleReply = async (parentCommentId: string) => {
    if (!replyContent.trim() || isPostingReply) return;
    setIsPostingReply(true);
    const content = replyContent;
    const { error } = await supabase
      .from('post_comments')
      .insert({ post_id: post.id, profile_id: currentProfileId, content, parent_comment_id: parentCommentId });
    setIsPostingReply(false);
    if (error) {
      console.error('Failed to post reply:', error.message);
      return;
    }
    setReplyContent('');
    setReplyingTo(null);
    loadComments(); // refetch so the new reply shows with real author info + ordering
  };

  // Comments are fetched as a flat list (parent_comment_id is null for
  // top-level comments, set to the parent's id for replies) — grouped
  // here for nested rendering, not via a separate query/table.
  const topLevelComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (commentId: string) => comments.filter(c => c.parent_comment_id === commentId);

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment? Any replies to it will also be deleted.')) return;
    const { error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId)
      .eq('profile_id', currentProfileId); // also enforced server-side by post_comments_delete_own
    if (error) {
      console.error('Failed to delete comment:', error.message);
      return;
    }
    // The DB cascades the delete to any replies (parent_comment_id on
    // delete cascade) — mirror that here so local state doesn't show
    // orphaned replies until the next refetch.
    const replyIds = getReplies(commentId).map(r => r.id);
    const removedCount = 1 + replyIds.length;
    setComments(prev => prev.filter(c => c.id !== commentId && !replyIds.includes(c.id)));
    setCommentCount(c => Math.max(0, c - removedCount));
  };

  const [shareToast, setShareToast] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  const handleShare = () => {
    if (viewerProfile?.role === 'parent') return; // parents are read-only
    // Permanent link — always points at this exact post via its real,
    // immutable posts.id. Same id used by comments/reactions/saves, so
    // there's no separate "share id" or duplicated record anywhere.
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(url)
      .then(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
      })
      .catch(() => {});
  };

  const [isDeletingPost, setIsDeletingPost] = useState(false);

  // Only the post owner can delete (also enforced by posts_delete_own RLS
  // server-side — this check is for UI/UX, not the actual security boundary).
  const isPostOwner = post.profile_id === currentProfileId;

  const handleDeletePost = async () => {
    if (isDeletingPost) return;
    if (!window.confirm('Delete this post? This also removes its comments, reactions, and saves.')) return;
    setIsDeletingPost(true);
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', post.id)
      .eq('profile_id', currentProfileId);
    if (error) {
      console.error('Failed to delete post:', error.message);
      setIsDeletingPost(false);
      return;
    }
    onPostDeleted(post.id);
  };

  const authorAvatarInitials = `${post.profiles?.first_name?.[0] ?? ''}${post.profiles?.last_name?.[0] ?? ''}`;

  return (
    <div className="card-premium p-5">
      <div className="flex items-center gap-3 mb-3">
        {post.profiles?.username ? (
          <SafeProfileLink
            targetProfile={post.profiles as Profile}
            viewerProfile={viewerProfile}
            viewerUserId={currentProfileId}
            className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-sm font-bold text-white flex-shrink-0 hover:opacity-90 transition-opacity"
          >
            {authorAvatarInitials}
          </SafeProfileLink>
        ) : (
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
            {authorAvatarInitials}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {post.profiles?.username ? (
              <SafeProfileLink
                targetProfile={post.profiles as Profile}
                viewerProfile={viewerProfile}
                viewerUserId={currentProfileId}
                className="text-sm font-semibold text-white hover:text-sr-purple-light transition-colors"
              >
                {fullName(post.profiles)}
              </SafeProfileLink>
            ) : (
              <span className="text-sm font-semibold text-white">Unknown athlete</span>
            )}
            {post.profiles?.username && <span className="text-xs text-sr-text-muted">@{post.profiles.username}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-sr-text-muted">
            <span>{timeAgo(post.created_at)}</span>
            {post.sport_tag && (
              <span className="px-1.5 py-0.5 rounded bg-sr-purple/10 text-sr-purple-light">
                {post.sport_tag}
              </span>
            )}
          </div>
        </div>
        {isPostOwner && (
          <button onClick={handleDeletePost} disabled={isDeletingPost}
            className="text-sr-text-muted hover:text-red-400 flex-shrink-0 p-1" title="Delete post">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {post.post_type === 'achievement' && (
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400 text-[11px] font-semibold tracking-wide">
            <Trophy className="h-3 w-3" />
            Achievement
          </span>
          {post.achievement_title && (
            <p className="text-sm font-semibold text-white">{post.achievement_title}</p>
          )}
        </div>
      )}

      {post.caption && <p className="text-sm text-sr-silver leading-relaxed mb-3">{post.caption}</p>}

      {post.media_url && (() => {
        const kind = resolveMediaKind(post.media_url, post.media_type);
        return (
          <div className={`relative mb-3 rounded-xl overflow-hidden bg-black border border-sr-border flex justify-center ${kind !== 'audio' ? 'cursor-pointer' : ''}`}
            onClick={e => { if (kind !== 'audio') handleTapMedia(e); }}>
            {kind === 'photo' && (
              <img src={post.media_url} alt="" className="max-h-[480px] w-auto max-w-full object-contain" />
            )}
            {kind === 'video' && (
              // No native `controls` — its skip ±10s/expand-to-fullscreen/
              // scrub buttons were intercepting taps meant for our own tap
              // -to-pause and double-tap-to-react gestures. playsInline is
              // what stops iOS Safari from forcing this into full-screen
              // the moment it starts playing — without it, autoplay-on
              // -scroll would yank the viewer into a full-screen player
              // instead of playing quietly inline like Instagram's feed.
              // #t=0.1 + preload="auto": a post that's already on-screen
              // the moment the page loads (no scroll needed to trigger the
              // observer) was showing solid black until tapped — same
              // blank-video issue fixed on the profile media grids, here
              // compounded by the browser not having buffered anything yet.
              // The time-fragment forces a real frame to render immediately
              // and preload="auto" gets playable data in sooner so autoplay
              // has something to show right away instead of a black box.
              <video ref={feedVideoRef} src={`${post.media_url}#t=0.1`} playsInline loop preload="auto" className="max-h-[480px] w-auto max-w-full" />
            )}
            {kind === 'audio' && (
              <div className="p-4 w-full">
                <audio src={post.media_url} controls className="w-full" />
              </div>
            )}
            {/* Centered play icon when manually paused — the only playback
                affordance now that native controls are gone. */}
            {kind === 'video' && videoPaused && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-16 w-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <Play className="h-7 w-7 text-white fill-white ml-1" />
                </div>
              </div>
            )}
            {/* Mute toggle — small, bottom-right corner, Reels-style —
                replaces the native controls' volume icon. */}
            {kind === 'video' && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  const video = feedVideoRef.current;
                  if (!video) return;
                  video.muted = !video.muted;
                  setVideoMuted(video.muted);
                }}
                className="absolute bottom-3 right-3 h-8 w-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white z-10"
                title={videoMuted ? 'Unmute' : 'Mute'}
              >
                {videoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
            <AnimatePresence>
              {showLikeBurst && (
                <div key={burstKey} className="absolute inset-0 pointer-events-none z-20">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const angle = (i / 6) * Math.PI * 2;
                    const distance = 40 + (i % 3) * 14;
                    return (
                      <motion.span
                        key={i}
                        className="absolute"
                        style={{ left: burstOrigin.x, top: burstOrigin.y, marginLeft: -10, marginTop: -10, filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.85))' }}
                        initial={{ opacity: 0, scale: 0.3, x: 0, y: 0, rotate: 0 }}
                        animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.2, 1, 0.7], x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, rotate: [-22, 10, 0] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.7, delay: i * 0.03, ease: 'easeOut' }}
                      >
                        <MuscleIcon size={20} filled uid={`feed-burst-${burstKey}-${i}`} />
                      </motion.span>
                    );
                  })}
                  <motion.span
                    className="absolute"
                    style={{ left: burstOrigin.x, top: burstOrigin.y, marginLeft: -20, marginTop: -20, filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.9))' }}
                    initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
                    animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1.05, 0.9], rotate: [0, -22, 10, 0] }}
                    transition={{ duration: 0.7, ease: 'easeInOut' }}
                  >
                    <MuscleIcon size={40} filled uid={`feed-burst-${burstKey}-main`} />
                  </motion.span>
                </div>
              )}
            </AnimatePresence>
          </div>
        );
      })()}

      <div className="flex items-center gap-1 pt-3 border-t border-sr-border">
        {viewerProfile?.role !== 'parent' && (
        <MuscleReactionButton
          reacted={reacted}
          count={reactionCount}
          pending={reactionPending}
          onToggle={handleReact}
          className="px-3 py-1.5 rounded-lg hover:bg-sr-surface-light transition-all"
        />
        )}
        <button onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-sr-text-muted hover:text-white hover:bg-sr-surface-light transition-all">
          <><MessageCircle className="inline mr-1 h-3.5 w-3.5" />{commentCount}</>
        </button>
        {viewerProfile?.role !== 'parent' && (
        <button onClick={handleSave} disabled={savePending}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
            saved ? 'text-sr-purple bg-sr-purple/10' : 'text-sr-text-muted hover:text-white hover:bg-sr-surface-light'
          }`}>
          <><BookmarkIcon size={14} className="inline mr-1" />{saved ? 'Saved' : 'Save'}</>
        </button>
        )}
        {viewerProfile?.role !== 'parent' && (
        <div className="relative">
          <button onClick={() => setShowShareMenu(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-sr-text-muted hover:text-white hover:bg-sr-surface-light transition-all">
            {shareToast ? 'Copied!' : <><ShareIcon size={14} className="inline mr-1" />Share</>}
          </button>
          {showShareMenu && (
            <div className="absolute right-0 bottom-full mb-1 w-44 card-premium p-1 z-10">
              <button onClick={() => { handleShare(); setShowShareMenu(false); }}
                className="w-full text-left px-3 py-2 text-xs text-sr-silver hover:bg-sr-surface-light rounded-lg transition-colors">
                <><LinkIcon size={14} className="inline mr-1" />Copy Link</>
              </button>
              {onShareToAthlete && (
                <button onClick={() => { onShareToAthlete(post); setShowShareMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-sr-silver hover:bg-sr-surface-light rounded-lg transition-colors">
                  <><CommentIcon size={14} className="inline mr-1" />Send to a Friend</>
                </button>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {showComments && (
        <div className="mt-3 pt-3 border-t border-sr-border">
          <div className="space-y-3 mb-3">
            {isLoadingComments ? (
              <p className="text-xs text-sr-text-muted">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-sr-text-muted">No comments yet. Be first!</p>
            ) : (
              topLevelComments.map(c => (
                <div key={c.id}>
                  {/* Top-level comment */}
                  <div id={`comment-${c.id}`}
                    className={`flex gap-2 items-start rounded-lg p-1.5 -m-1.5 transition-colors duration-700 ${highlightedId === c.id ? 'bg-sr-purple/20' : ''}`}>
                    <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-sr-purple/50 to-sr-blue/50 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                      {c.profiles?.first_name?.[0] ?? '?'}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-sr-silver">
                        <span className="font-medium text-white">{c.profiles ? fullName(c.profiles) : 'Unknown'}</span>{' '}{c.content}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-sr-text-muted">{timeAgo(c.created_at)}</p>
                        <button onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                          className="text-[10px] text-sr-purple-light hover:underline">
                          Reply
                        </button>
                      </div>
                    </div>
                    {c.profile_id === currentProfileId && (
                      <button onClick={() => handleDeleteComment(c.id)}
                        className="text-sr-text-muted hover:text-red-400 flex-shrink-0" title="Delete comment">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Replies — nested/indented under the parent */}
                  {getReplies(c.id).length > 0 && (
                    <div className="ml-8 mt-2 space-y-2 border-l border-sr-border pl-3">
                      {getReplies(c.id).map(r => (
                        <div key={r.id} id={`comment-${r.id}`}
                          className={`flex gap-2 items-start rounded-lg p-1.5 -m-1.5 transition-colors duration-700 ${highlightedId === r.id ? 'bg-sr-purple/20' : ''}`}>
                          <div className="h-5 w-5 rounded-lg bg-gradient-to-br from-sr-purple/40 to-sr-blue/40 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                            {r.profiles?.first_name?.[0] ?? '?'}
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-sr-silver">
                              <span className="font-medium text-white">{r.profiles ? fullName(r.profiles) : 'Unknown'}</span>{' '}{r.content}
                            </p>
                            <p className="text-[10px] text-sr-text-muted mt-0.5">{timeAgo(r.created_at)}</p>
                          </div>
                          {r.profile_id === currentProfileId && (
                            <button onClick={() => handleDeleteComment(r.id)}
                              className="text-sr-text-muted hover:text-red-400 flex-shrink-0" title="Delete reply">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply input — only shown for the comment currently being replied to */}
                  {replyingTo === c.id && (
                    <div className="ml-8 mt-2 flex gap-2 pl-3">
                      <input type="text" value={replyContent} onChange={e => setReplyContent(e.target.value)}
                        className="flex-1 input-dark text-xs py-1.5" placeholder={`Reply to ${c.profiles ? fullName(c.profiles) : 'this comment'}...`}
                        onKeyDown={e => e.key === 'Enter' && handleReply(c.id)} autoFocus />
                      <Button variant="brand" size="sm" onClick={() => handleReply(c.id)} disabled={!replyContent.trim() || isPostingReply}>
                        Reply
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {viewerProfile?.role !== 'parent' && (
          <div className="flex gap-2">
            <input type="text" value={comment} onChange={e => setComment(e.target.value)}
              className="flex-1 input-dark text-xs py-2" placeholder="Add a comment..."
              onKeyDown={e => e.key === 'Enter' && handleComment()} />
            <Button variant="brand" size="sm" onClick={handleComment} disabled={!comment.trim() || isPostingComment}>Post</Button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// CONVERSATIONS LIST
// ═══════════════════════════════════════════════════
function ConversationsView({ conversations, isLoading, onSelect, onDelete }: {
  conversations: ConversationSummary[];
  isLoading: boolean;
  onSelect: (conversationId: string, otherProfile: Profile) => void;
  onDelete?: (conversationId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card-premium p-5 text-center">
        <MessageCircle className="h-8 w-8 mx-auto text-sr-text-muted mb-3" />
        <h3 className="text-base font-semibold text-white mb-1">Messages</h3>
        <p className="text-sm text-sr-text-muted">
          {conversations.length === 0
            ? 'No conversations yet. Visit someone\'s profile and tap Message to start.'
            : `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`}
        </p>
      </div>
      {isLoading ? (
        <div className="card-premium p-8 text-center">
          <Loader2 className="h-5 w-5 mx-auto text-sr-purple animate-spin" />
        </div>
      ) : (
        conversations.map(conv => (
          <div key={conv.conversationId} role="button" tabIndex={0} onClick={() => onSelect(conv.conversationId, conv.otherProfile)}
            className="w-full card-premium p-4 text-left hover:border-sr-purple/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {conv.otherProfile.first_name?.[0]}{conv.otherProfile.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{fullName(conv.otherProfile)}</p>
                <p className="text-xs text-sr-text-muted truncate">{conv.lastMessage?.content || 'No messages yet'}</p>
              </div>
              {conv.unread && (
                <span className="h-2.5 w-2.5 rounded-full bg-sr-purple flex-shrink-0" />
              )}
              {onDelete && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(conv.conversationId); }}
                  className="text-sr-text-muted hover:text-red-400 flex-shrink-0 p-1" title="Delete chat">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════
// CHAT VIEW
// ═══════════════════════════════════════════════════
function ChatView({ currentProfile, otherProfile, messages, sharedPostsById, blockedIds, onBack, onSend, onDeleteForMe, onDeleteForEveryone, onReportMessage }: {
  currentProfile: Profile;
  otherProfile: Profile;
  messages: Message[];
  sharedPostsById: Record<string, FeedPost>;
  blockedIds: Set<string>;
  onBack: () => void;
  onSend: (content: string) => void;
  onDeleteForMe: (messageId: string) => void;
  onDeleteForEveryone: (messageId: string) => void;
  onReportMessage: (messageId: string) => void;
}) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [reactions, setReactions] = useState<Record<string, { type: string; count: number; reacted: boolean }[]>>({});
  const [showReactPicker, setShowReactPicker] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Flat lookup: reaction row id → {message_id, type, profile_id}
  // Used by the Realtime DELETE handler when payload.old only contains id.
  const reactionRowsById = useRef<Record<string, { message_id: string; type: string; profile_id: string }>>({});
  // Ref so Realtime callbacks always see the current message list without
  // being stale closures or recreating the subscription on every message.
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const REACTION_IDS = ['strength', 'respect', 'fire', 'clap', 'laugh', 'support'] as const;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  // Typing indicator via broadcast channel
  useEffect(() => {
    const channelName = [currentProfile.id, otherProfile.id].sort().join(':');
    const channel = supabase.channel(`typing:${channelName}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.sender_id !== currentProfile.id) {
          setIsTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
        }
      }).subscribe();
    typingChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [currentProfile.id, otherProfile.id]);

  const broadcastTyping = () => {
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { sender_id: currentProfile.id } });
  };

  // Mark as read
  useEffect(() => {
    if (messages.length === 0) return;
    const cid = messages[0]?.conversation_id;
    if (!cid) return;
    supabase.from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', cid).eq('profile_id', currentProfile.id)
      .then(({ error }) => { if (error) console.error('[read-receipt]', error.message); });
  }, [messages.length, currentProfile.id]);

  // Load reactions once per conversation — NOT on every messages.length change.
  // messages.length as a dependency caused a DB re-fetch on every new message,
  // which overwrote optimistic state before the write propagated.
  const conversationId = messages[0]?.conversation_id ?? null;
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    supabase.from('message_reactions').select('*').in('message_id', messages.map(m => m.id))
      .then(({ data }) => {
        if (!data) return;
        const grouped: Record<string, { type: string; count: number; reacted: boolean }[]> = {};
        for (const r of data as { id: string; message_id: string; type: string; profile_id: string }[]) {
          // Populate flat lookup for DELETE-by-id support.
          reactionRowsById.current[r.id] = { message_id: r.message_id, type: r.type, profile_id: r.profile_id };
          if (!grouped[r.message_id]) grouped[r.message_id] = [];
          const ex = grouped[r.message_id].find(x => x.type === r.type);
          if (ex) { ex.count++; if (r.profile_id === currentProfile.id) ex.reacted = true; }
          else grouped[r.message_id].push({ type: r.type, count: 1, reacted: r.profile_id === currentProfile.id });
        }
        setReactions(grouped);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const toggleReaction = async (messageId: string, emoji: string) => {
    setShowReactPicker(null);

    // Derive myExisting inside the updater from `prev` to avoid stale closure.
    // We also need it for the DB call, so read it once from current state
    // and pass it through — it's safe here since we read-then-write atomically.
    const myExisting = reactions[messageId]?.find(r => r.reacted) ?? null;
    const isSameEmoji = myExisting?.type === emoji;

    setReactions(prev => {
      // Re-derive from prev (the authoritative current state, not the closure).
      const myPrev = prev[messageId]?.find(r => r.reacted) ?? null;
      const isSame = myPrev?.type === emoji;
      const current = prev[messageId] ?? [];

      // Remove any old reaction this user had.
      let next = current
        .map(r => r.type === myPrev?.type
          ? { ...r, count: r.count - 1, reacted: false }
          : r)
        .filter(r => r.count > 0);

      // Add the new emoji unless toggling off.
      if (!isSame) {
        const hit = next.find(r => r.type === emoji);
        next = hit
          ? next.map(r => r.type === emoji ? { ...r, count: r.count + 1, reacted: true } : r)
          : [...next, { type: emoji, count: 1, reacted: true }];
      }
      return { ...prev, [messageId]: next };
    });

    // DB write using the pre-captured values (consistent with what updater did).
    if (myExisting) {
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('profile_id', currentProfile.id);
      if (error) console.error('reaction delete failed:', error.message);
      // Remove from flat lookup — find by message_id + profile_id.
      for (const [id, row] of Object.entries(reactionRowsById.current)) {
        if (row.message_id === messageId && row.profile_id === currentProfile.id) {
          delete reactionRowsById.current[id];
          break;
        }
      }
    }
    if (!isSameEmoji) {
      const { data: inserted, error } = await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, profile_id: currentProfile.id, type: emoji })
        .select('id, message_id, profile_id, type')
        .single();
      if (error) console.error('reaction insert failed:', error.message);
      // Validate all four fields before registering in the lookup map.
      // Guards against partial responses and against the Realtime INSERT
      // arriving first (that path skips own profile_id, so no duplicate).
      if (inserted) {
        const row = inserted as { id?: string; message_id?: string; profile_id?: string; type?: string };
        if (row.id && row.message_id && row.profile_id && row.type) {
          reactionRowsById.current[row.id] = {
            message_id: row.message_id,
            type: row.type,
            profile_id: row.profile_id,
          };
        }
      }
    }
  };

  // Realtime subscription for reaction changes from the other participant.
  // Uses a conversation-level Postgres filter so:
  //   1. We never miss events for messages that arrive after subscription start.
  //   2. No stale Set of message IDs to maintain.
  //   3. Channel is stable for the lifetime of the conversation (conversationId dep only).
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`reactions:${conversationId}:${currentProfile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_reactions',
        // Server-side filter: only events for messages in this conversation.
        // Requires message_reactions to have a conversation_id column OR we
        // filter client-side. Since message_reactions only has message_id,
        // we filter client-side against the messages prop — but we READ the
        // current message list from a ref to avoid stale closure.
      }, (payload) => {
        const r = payload.new as { id?: string; message_id?: string; type?: string; profile_id?: string };
        if (!r.id || !r.message_id || !r.type || !r.profile_id) return; // malformed payload
        if (r.profile_id === currentProfile.id) return; // own, handled optimistically
        // Only care about messages in this conversation.
        if (!messagesRef.current.some(m => m.id === r.message_id)) return;
        // Store in flat lookup — skip if already registered (guards against duplicate events).
        if (!reactionRowsById.current[r.id]) {
          reactionRowsById.current[r.id] = { message_id: r.message_id, type: r.type, profile_id: r.profile_id };
        }
        setReactions(prev => {
          const current = prev[r.message_id] ?? [];
          // Remove any existing entry for this user first (one-per-user).
          // Then add the new one.
          const hit = current.find(x => x.type === r.type);
          const updated = hit
            ? current.map(x => x.type === r.type ? { ...x, count: x.count + 1 } : x)
            : [...current, { type: r.type, count: 1, reacted: false }];
          return { ...prev, [r.message_id]: updated };
        });
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'message_reactions',
      }, (payload) => {
        const raw = payload.old as { id?: string; message_id?: string; type?: string; profile_id?: string };

        // Resolve the row metadata: use payload fields if present (REPLICA IDENTITY FULL),
        // otherwise fall back to our local lookup map (id-only payload).
        const rowId = raw.id;
        const resolved = (raw.message_id && raw.type && raw.profile_id)
          ? { message_id: raw.message_id, type: raw.type, profile_id: raw.profile_id }
          : rowId ? reactionRowsById.current[rowId] : undefined;

        if (!resolved) return; // can't identify row
        if (resolved.profile_id === currentProfile.id) return; // own, handled optimistically

        // Clean up the lookup map.
        if (rowId) delete reactionRowsById.current[rowId];

        setReactions(prev => {
          const current = prev[resolved.message_id] ?? [];
          const updated = current
            .map(x => x.type === resolved.type ? { ...x, count: x.count - 1 } : x)
            .filter(x => x.count > 0);
          return { ...prev, [resolved.message_id]: updated };
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, currentProfile.id]);

  const handleSend = async () => {
    if (!content.trim() || isSending) return;
    setIsSending(true); setSendError('');
    try { await onSend(content); setContent(''); }
    catch (err) { setSendError(err instanceof Error ? err.message : 'Could not send. Please try again.'); }
    finally { setIsSending(false); }
  };

  const lastSentId = [...messages].reverse().find(m => m.sender_id === currentProfile.id)?.id;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="card-premium p-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg text-sr-text-muted hover:text-white hover:bg-sr-surface-light transition-colors flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <SafeProfileLink targetProfile={otherProfile} viewerProfile={currentProfile} viewerUserId={currentProfile.id}
          className="h-9 w-9 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {otherProfile.first_name?.[0]}{otherProfile.last_name?.[0]}
        </SafeProfileLink>
        <SafeProfileLink targetProfile={otherProfile} viewerProfile={currentProfile} viewerUserId={currentProfile.id}
          className="text-sm font-semibold text-white hover:text-sr-purple-light transition-colors min-w-0 truncate">
          {fullName(otherProfile)}
        </SafeProfileLink>
      </div>

      {/* Messages */}
      <div className="card-premium p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '420px' }}
        onClick={() => setOpenMenuId(null)}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center mb-3">
              <MessageCircle className="h-6 w-6 text-sr-purple-light" />
            </div>
            <p className="text-sm font-medium text-white mb-1">Start the conversation</p>
            <p className="text-xs text-sr-text-muted">Send {otherProfile.first_name} a message below.</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isMine = msg.sender_id === currentProfile.id;
              const msgReactions = reactions[msg.id] ?? [];

              // Long-press timer lives outside render so it's stable per message.
              // Both long-press (mobile) and the hover 😊 button (desktop) set
              // showReactPicker — they share exactly the same state and picker UI.
              let lpTimer: ReturnType<typeof setTimeout> | null = null;
              const onTouchStart = () => { lpTimer = setTimeout(() => setShowReactPicker(msg.id), 500); };
              const onTouchEnd   = () => { if (lpTimer) clearTimeout(lpTimer); };

              return (
                <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>

                  {/* Reaction picker backdrop — closes picker on outside click without
                      interfering with normal chat interaction (pointer-events only active
                      when picker is open for this message). */}
                  {showReactPicker === msg.id && (
                    <div
                      className="fixed inset-0 z-[9998]"
                      onClick={() => setShowReactPicker(null)}
                    />
                  )}

                  {/* group wraps the ENTIRE hover area: bubble + action buttons.
                      Buttons are inside this div so mouse never leaves the group
                      when moving from bubble to button. */}
                  <div className="group relative max-w-[78%] sm:max-w-[70%]">

                    {/* Hover action bar — sits above the bubble, visible on group:hover.
                        Placed INSIDE the group div so hover is never lost. */}
                    <div className={`absolute -top-7 ${isMine ? 'right-0' : 'left-0'} flex items-center gap-1
                      opacity-0 group-hover:opacity-100 transition-opacity z-10`}>

                      {/* reaction button — opens picker, does NOT touch openMenuId */}
                      <button
                        onClick={e => { e.stopPropagation(); setShowReactPicker(showReactPicker === msg.id ? null : msg.id); }}
                        className="h-6 w-6 rounded-full bg-sr-bg border border-sr-border flex items-center justify-center text-xs hover:bg-sr-surface-light transition-colors"
                        title="React"
                      ><ReactionIcon size={18} /></button>

                      {/* ⋮ actions button — opens menu, does NOT touch showReactPicker */}
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === msg.id ? null : msg.id); }}
                        className="h-6 w-6 rounded-full bg-sr-bg border border-sr-border flex items-center justify-center text-sr-text-muted hover:text-white hover:bg-sr-surface-light transition-colors"
                        title="More"
                      ><MoreVertical className="h-3 w-3" /></button>
                    </div>

                    {/* Three-dots dropdown — delete actions only, no reaction entry */}
                    {openMenuId === msg.id && (
                      <div
                        className={`absolute ${isMine ? 'right-0' : 'left-0'} top-0 w-44 card-premium p-1 z-30`}
                        onClick={e => e.stopPropagation()}
                      >
                        <button onClick={() => { setOpenMenuId(null); onDeleteForMe(msg.id); }}
                          className="w-full text-left px-3 py-2 text-xs text-sr-silver hover:bg-sr-surface-light rounded-lg">Delete for me</button>
                        {isMine && <button onClick={() => { setOpenMenuId(null); onDeleteForEveryone(msg.id); }}
                          className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-sr-surface-light rounded-lg">Delete for everyone</button>}
                        {!isMine && <button onClick={() => { setOpenMenuId(null); onReportMessage(msg.id); }}
                          className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-sr-surface-light rounded-lg">Report message</button>}
                      </div>
                    )}

                    {/* Reaction picker — fixed overlay, escapes overflow:hidden/auto container.
                        z-[9999] sits above the backdrop at z-[9998]. */}
                    {showReactPicker === msg.id && (
                      <div
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 flex gap-1.5 bg-sr-surface border border-sr-border rounded-2xl px-3 py-2.5 z-[9999] shadow-2xl"
                        onClick={e => e.stopPropagation()}
                      >
                        {REACTION_IDS.map(rid => (
                          <button key={rid} onClick={() => toggleReaction(msg.id, rid)}
                            title={rid.charAt(0).toUpperCase() + rid.slice(1)}
                            className={`hover:scale-125 transition-transform p-1.5 rounded-lg ${
                              msgReactions.find(r => r.type === rid && r.reacted) ? 'bg-sr-purple/20 ring-1 ring-sr-purple/40' : ''
                            }`}>
                            <ReactionIconById id={rid} size={18} uid={`${msg.id}-${rid}`} />
                          </button>
                        ))}
                        <button onClick={e => { e.stopPropagation(); setShowReactPicker(null); }}
                          className="ml-1 text-sr-text-muted hover:text-white text-xs self-center px-1 leading-none">×</button>
                      </div>
                    )}

                    {/* Bubble — long-press triggers reaction picker on mobile */}
                    <div
                      className={`p-3 rounded-xl ${isMine ? 'bg-sr-purple text-white rounded-br-sm' : 'bg-sr-surface text-sr-silver rounded-bl-sm'}`}
                      onTouchStart={onTouchStart}
                      onTouchEnd={onTouchEnd}
                      onTouchMove={onTouchEnd}
                    >
                      {msg.shared_post_id && (sharedPostsById[msg.shared_post_id] ? <SharedPostPreview post={sharedPostsById[msg.shared_post_id]} /> : <p className="text-xs italic opacity-70 mb-1">Shared post...</p>)}
                      {msg.media_url && (
                        <div className="mb-2 rounded overflow-hidden">
                          {msg.media_type === 'photo' && <img src={msg.media_url} alt="" className="max-h-48 w-full object-cover" />}
                          {msg.media_type === 'video' && <video src={msg.media_url} controls className="max-h-48 w-full" />}
                          {msg.media_type === 'audio' && <audio src={msg.media_url} controls className="w-full" />}
                        </div>
                      )}
                      {msg.content && <p className="text-sm break-words">{msg.content}</p>}
                      <p className={`text-[10px] mt-1 ${isMine ? 'text-white/60' : 'text-sr-text-muted'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>{/* end bubble */}
                    {/* Reactions */}
                    {msgReactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {msgReactions.map(r => (
                          <button key={r.type} onClick={() => toggleReaction(msg.id, r.type)}
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${r.reacted ? 'bg-sr-purple/20 border-sr-purple/40 text-white' : 'bg-sr-surface border-sr-border text-sr-text-muted hover:border-sr-purple/30'}`}>
                            {r.type}{r.count > 1 && <span className="ml-0.5">{r.count}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Read receipt on last sent message */}
                  {msg.id === lastSentId && <p className="text-[10px] text-sr-text-muted mt-0.5 px-1">Delivered</p>}
                </div>
              );
            })}
            {/* Typing indicator */}
            {isTyping && (
              <div className="flex items-start">
                <div className="bg-sr-surface rounded-xl rounded-bl-sm px-3 py-2 flex items-center gap-1">
                  {[0, 150, 300].map(d => <span key={d} className="h-1.5 w-1.5 rounded-full bg-sr-text-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="card-premium p-3">
        {otherProfile && blockedIds.has(otherProfile.id) ? (
          <div className="py-2 text-center text-xs text-sr-text-muted">
            Messaging is unavailable between these accounts.
          </div>
        ) : (
          <>
            {sendError && <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{sendError}</div>}
            <div className="flex items-center gap-2">
              <input type="text" value={content} onChange={e => { setContent(e.target.value); broadcastTyping(); }}
                className="flex-1 input-dark text-sm py-2 min-w-0" placeholder="Type a message..."
                onKeyDown={e => e.key === 'Enter' && handleSend()} />
              <Button variant="brand" size="sm" icon={<Send className="h-3.5 w-3.5" />}
                onClick={handleSend} disabled={!content.trim() || isSending}>
                <span className="hidden sm:inline">Send</span>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SHARED POST PREVIEW
// Compact card shown inside a message when shared_post_id is set.
// References the original post — no caption/media duplicated into the
// message itself, this always reflects the live post.
// ═══════════════════════════════════════════════════
function SharedPostPreview({ post }: { post: FeedPost }) {
  const kind = resolveMediaKind(post.media_url, post.media_type);
  return (
    <Link to={`/post/${post.id}`}
      className="block mb-2 rounded-lg overflow-hidden border border-white/20 bg-black/10 hover:bg-black/20 transition-colors">
      {kind === 'photo' && post.media_url && (
        <img src={post.media_url} alt="" className="w-full max-h-32 object-cover" />
      )}
      {kind === 'video' && post.media_url && (
        // #t=0.1 forces a cover frame to render on load — same iOS Safari
        // blank-video-thumbnail issue fixed on the profile media grids.
        <video src={`${post.media_url}#t=0.1`} className="w-full max-h-32 object-cover" muted playsInline preload="metadata" />
      )}
      <div className="p-2 flex items-center gap-2">
        <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
          {post.profiles?.first_name?.[0]}{post.profiles?.last_name?.[0]}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium leading-tight">{post.profiles ? fullName(post.profiles) : 'Unknown athlete'}</p>
          {post.caption && <p className="text-[11px] opacity-80 truncate">{post.caption}</p>}
        </div>
      </div>
    </Link>
  );
}
