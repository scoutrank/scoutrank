import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, fullName } from '@/lib/supabase';
import type { Post, Profile } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { MessageCircle, Bookmark, Share2, Zap, Volume2, VolumeX, Play } from 'lucide-react';
import { LinkIcon, MuscleIcon } from '@/components/icons';
import { MuscleReactionButton } from '@/components/MuscleReactionButton';
import { CommentSheet } from '@/components/CommentSheet';
import { ShareToFriendModal } from '@/components/ShareToFriendModal';
import { SafeProfileLink } from '@/components/ui/SafeProfileLink';

export type ExplorePost = Post & { profiles: Profile; reactionCount: number; commentCount: number };

export function ExploreCard({
  post,
  isActive,
  muted,
  onToggleMute,
  initialReacted,
  initialSaved,
  currentProfile,
  commentCount,
  onCommentPosted,
}: {
  post: ExplorePost;
  isActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  initialReacted: boolean;
  initialSaved: boolean;
  currentProfile: Profile | null | undefined;
  commentCount: number;
  onCommentPosted?: () => void;
}) {
  const currentProfileId = currentProfile?.id;
  const [reacted, setReacted] = useState(initialReacted);
  const [reactionCount, setReactionCount] = useState(post.reactionCount);
  const [reactionPending, setReactionPending] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [savePending, setSavePending] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [showShareToFriend, setShowShareToFriend] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The parent's batched fetches can resolve after this card first mounts
  // (posts load, then reactions/saves load slightly later) — resync
  // whenever the real value lands, same fix as the Feed page uses.
  useEffect(() => {
    setReacted(initialReacted);
    setReactionCount(post.reactionCount);
  }, [initialReacted, post.reactionCount]);

  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  // Becoming the active card (freshly scrolled to) always restarts from the
  // top and resets any previous manual pause. This effect ONLY reacts to
  // isActive changing, not to userPaused — so toggling pause never rewinds.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      video.currentTime = 0;
      setUserPaused(false);
    } else {
      video.pause();
    }
  }, [isActive]);

  // Manual pause/resume — this is the ONLY effect that reacts to userPaused,
  // and it never touches currentTime, so resuming continues from wherever
  // playback actually was instead of restarting.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive) return;
    if (userPaused) video.pause();
    else video.play().catch(() => {});
  }, [userPaused, isActive]);

  // Switching browser tabs (or away from this one) pauses the video, same
  // as Instagram Reels — and resumes it from the same spot when you come
  // back, unless it was already manually paused before you switched away.
  const pausedByVisibilityRef = useRef(false);
  useEffect(() => {
    const handleVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) {
        if (!video.paused) {
          video.pause();
          pausedByVisibilityRef.current = true;
        }
      } else if (pausedByVisibilityRef.current) {
        pausedByVisibilityRef.current = false;
        if (isActive && !userPaused) video.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isActive, userPaused]);

  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const [burstOrigin, setBurstOrigin] = useState({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const singleTapTimeoutRef = useRef<number | null>(null);

  const addReactionOnly = async () => {
    if (reactionPending || !currentProfileId || reacted) return;
    setReactionPending(true);
    const { error } = await supabase
      .from('post_reactions')
      .insert({ post_id: post.id, profile_id: currentProfileId, type: 'strength' });
    if (error) console.error('[ExploreCard] Failed to add reaction:', error.message);
    else { setReacted(true); setReactionCount(c => c + 1); }
    setReactionPending(false);
  };

  const handleReact = async () => {
    if (reactionPending || !currentProfileId) return;
    setReactionPending(true);

    const { data: existing, error: checkError } = await supabase
      .from('post_reactions')
      .select('id')
      .eq('post_id', post.id)
      .eq('profile_id', currentProfileId)
      .maybeSingle();

    if (checkError) {
      console.error('[ExploreCard] Failed to check reaction state:', checkError.message);
      setReactionPending(false);
      return;
    }

    if (existing) {
      const { error } = await supabase.from('post_reactions').delete().eq('id', existing.id);
      if (error) console.error('[ExploreCard] Failed to remove reaction:', error.message);
      else { setReacted(false); setReactionCount(c => Math.max(0, c - 1)); }
    } else {
      const { error } = await supabase
        .from('post_reactions')
        .insert({ post_id: post.id, profile_id: currentProfileId, type: 'strength' });
      if (error) console.error('[ExploreCard] Failed to add reaction:', error.message);
      else { setReacted(true); setReactionCount(c => c + 1); }
    }

    setReactionPending(false);
  };

  // Same real, database-backed save as the Feed page — this is what makes
  // saved posts actually show up in the Saved tab on your profile.
  const handleSave = async () => {
    if (savePending || !currentProfileId) return;
    setSavePending(true);

    const { data: existing, error: checkError } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('post_id', post.id)
      .eq('profile_id', currentProfileId)
      .maybeSingle();

    if (checkError) {
      console.error('[ExploreCard] Failed to check saved state:', checkError.message);
      setSavePending(false);
      return;
    }

    if (existing) {
      const { error } = await supabase.from('saved_posts').delete().eq('id', existing.id);
      if (error) console.error('[ExploreCard] Failed to unsave post:', error.message);
      else setSaved(false);
    } else {
      const { error } = await supabase
        .from('saved_posts')
        .insert({ post_id: post.id, profile_id: currentProfileId });
      if (error) console.error('[ExploreCard] Failed to save post:', error.message);
      else setSaved(true);
    }

    setSavePending(false);
  };

  const isVideo = post.media_type === 'video';

  // Tapping once pauses/resumes video in place. Double-tapping (within
  // 300ms) always likes — never un-likes, matching the TikTok/Instagram
  // convention — and shows a burst animation regardless of whether the
  // like state actually changed, since it should feel satisfying even
  // if you'd already liked it.
  const handleTapMedia = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    const sinceLastTap = now - lastTapRef.current;
    lastTapRef.current = now;

    if (sinceLastTap < 300) {
      if (singleTapTimeoutRef.current) {
        window.clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      setBurstOrigin({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setBurstKey(k => k + 1);
      setShowLikeBurst(true);
      window.setTimeout(() => setShowLikeBurst(false), 800);
      addReactionOnly();
      return;
    }

    singleTapTimeoutRef.current = window.setTimeout(() => {
      if (isVideo) setUserPaused(p => !p);
      singleTapTimeoutRef.current = null;
    }, 300);
  };

  return (
    <div className="h-full flex items-center justify-center px-4">
      {/* Portrait video/photo card */}
      <div
        className="relative w-full max-w-[calc((100dvh-11.5rem)*9/16)] md:max-w-[calc((100dvh-7.5rem)*9/16)] aspect-[9/16] rounded-xl overflow-hidden cursor-pointer bg-black flex-shrink-0"
        onClick={handleTapMedia}
      >
        {post.media_type === 'photo' ? (
          <img
            src={post.media_url!}
            alt=""
            className="absolute inset-0 w-full h-full object-contain object-center bg-black"
            loading="lazy"
          />
        ) : isVideo ? (
          <video
            ref={videoRef}
            src={post.media_url!}
            className="absolute inset-0 w-full h-full object-cover"
            muted={muted}
            loop
            playsInline
            preload="metadata"
          />
        ) : null}

        {/* Gradient overlay for caption legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />

        {/* Double-tap like burst — the real branded muscle icon (purple,
            same one used everywhere else reactions show up), scattered
            outward from the actual tap point rather than always centered. */}
        <AnimatePresence>
          {showLikeBurst && (
            <div key={burstKey} className="absolute inset-0 pointer-events-none z-20">
              {Array.from({ length: 6 }).map((_, i) => {
                const angle = (i / 6) * Math.PI * 2;
                const distance = 45 + (i % 3) * 16;
                return (
                  <motion.span
                    key={i}
                    className="absolute"
                    style={{ left: burstOrigin.x, top: burstOrigin.y, marginLeft: -12, marginTop: -12, filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.85))' }}
                    initial={{ opacity: 0, scale: 0.3, x: 0, y: 0, rotate: 0 }}
                    animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.2, 1, 0.7], x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, rotate: [-22, 10, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, delay: i * 0.03, ease: 'easeOut' }}
                  >
                    <MuscleIcon size={24} filled uid={`burst-${burstKey}-${i}`} />
                  </motion.span>
                );
              })}
              <motion.span
                className="absolute"
                style={{ left: burstOrigin.x, top: burstOrigin.y, marginLeft: -24, marginTop: -24, filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.9))' }}
                initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1.05, 0.9], rotate: [0, -22, 10, 0] }}
                transition={{ duration: 0.7, ease: 'easeInOut' }}
              >
                <MuscleIcon size={48} filled uid={`burst-${burstKey}-main`} />
              </motion.span>
            </div>
          )}
        </AnimatePresence>

        {/* Centered play icon when manually paused */}
        {isVideo && userPaused && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-16 w-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Play className="h-7 w-7 text-white fill-white ml-1" />
            </div>
          </div>
        )}

        {/* Post type badge */}
        {post.post_type !== 'post' && (
          <div className="absolute top-4 left-4">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm bg-sr-purple/30 text-purple-200 border border-sr-purple/30">
              <Zap className="h-3 w-3" />
              Highlight
            </span>
          </div>
        )}

        {/* Mute toggle — small, bottom-right corner of the video itself, Reels-style */}
        {isVideo && (
          <button
            onClick={e => { e.stopPropagation(); onToggleMute(); }}
            className="absolute bottom-4 right-4 h-8 w-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}

        {/* Bottom-left creator info + caption */}
        <div className="absolute bottom-0 left-0 right-14 p-4" onClick={e => e.stopPropagation()}>
          {/* Was a bare <Link> — every equivalent spot on the Feed page uses
              SafeProfileLink, which withholds navigation when the viewer may
              be a minor and the target is an unverified coach/scout. This is
              the same tap, so it needs the same gate. */}
          <SafeProfileLink
            targetProfile={post.profiles}
            viewerProfile={currentProfile}
            viewerUserId={currentProfileId}
            className="flex items-center gap-2 mb-2 w-fit"
          >
            <div className="h-7 w-7 rounded-full overflow-hidden bg-gradient-to-br from-sr-purple to-sr-blue flex-shrink-0">
              {post.profiles.avatar_url ? (
                <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-white text-[10px] font-bold">
                  {post.profiles.first_name?.[0]}{post.profiles.last_name?.[0]}
                </div>
              )}
            </div>
            <span className="text-sm font-bold text-white drop-shadow">{fullName(post.profiles)}</span>
            <span className="text-xs text-white/60">@{post.profiles.username}</span>
          </SafeProfileLink>
          {post.post_type === 'achievement' && post.achievement_title && (
            <p className="text-white font-semibold text-sm mb-1 drop-shadow">{post.achievement_title}</p>
          )}
          <p className="text-white/90 text-sm leading-snug line-clamp-2 drop-shadow">
            {post.caption}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            {post.sport_tag && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-sr-purple/40 text-purple-200 border border-sr-purple/30 backdrop-blur-sm">
                #{post.sport_tag}
              </span>
            )}
            <span className="text-xs text-white/50">{timeAgo(post.created_at)}</span>
          </div>
        </div>

        {/* Action rail — overlaid on the card itself, TikTok-style, not floating in separate dead space beside it */}
        <div className="absolute right-2 sm:right-3 bottom-20 flex flex-col items-center gap-4 z-10" onClick={e => e.stopPropagation()}>
          <MuscleReactionButton
            reacted={reacted}
            count={reactionCount}
            pending={reactionPending}
            onToggle={handleReact}
            size={24}
            className="flex-col gap-1 text-white drop-shadow-lg"
          />
          <button onClick={e => { e.stopPropagation(); setShowComments(true); }} className="flex flex-col items-center gap-1 text-white drop-shadow-lg">
            <MessageCircle className="h-6 w-6" />
            <span className="text-[11px] font-semibold">{commentCount}</span>
          </button>
          <div className="relative flex flex-col items-center">
            <button
              onClick={e => { e.stopPropagation(); setShowShareMenu(s => !s); }}
              className="flex flex-col items-center gap-1 text-white drop-shadow-lg"
            >
              <Share2 className="h-6 w-6" />
            </button>
            {showShareMenu && (
              <div
                className="absolute right-full bottom-0 mr-2 w-44 card-premium p-1 z-10"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin + `/explore/${post.id}`).catch(() => {});
                    setShareToast(true);
                    setShowShareMenu(false);
                    setTimeout(() => setShareToast(false), 2000);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-sr-silver hover:bg-sr-surface-light rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <LinkIcon size={14} />Copy Link
                </button>
                <button
                  onClick={() => { setShowShareMenu(false); setShowShareToFriend(true); }}
                  className="w-full text-left px-3 py-2 text-xs text-sr-silver hover:bg-sr-surface-light rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <MessageCircle size={14} />Send to a Friend
                </button>
              </div>
            )}
            {shareToast && (
              <div className="absolute right-full bottom-0 mr-2 px-2.5 py-1.5 rounded-lg bg-sr-surface-light text-xs text-white whitespace-nowrap">
                Copied!
              </div>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); handleSave(); }}
            disabled={savePending}
            className="flex flex-col items-center gap-1 text-white drop-shadow-lg disabled:opacity-60"
          >
            <Bookmark className={`h-6 w-6 ${saved ? 'fill-sr-purple-light text-sr-purple-light' : ''}`} />
          </button>
        </div>

        {/* Comment panel — scoped to this card, covering its bottom third, not the whole screen */}
        <CommentSheet
          postId={post.id}
          open={showComments}
          onClose={() => setShowComments(false)}
          currentProfileId={currentProfileId}
          onCommentPosted={onCommentPosted}
          postOwnerId={post.profile_id}
          isAdmin={currentProfile?.role === 'admin' || currentProfile?.role === 'super_admin'}
        />
      </div>

      <ShareToFriendModal
        postId={post.id}
        currentProfile={currentProfile ?? null}
        open={showShareToFriend}
        onClose={() => setShowShareToFriend(false)}
      />
    </div>
  );
}
