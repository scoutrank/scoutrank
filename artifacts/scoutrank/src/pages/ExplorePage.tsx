import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Compass, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { ExploreCard, type ExplorePost } from '@/components/ExploreCard';
import { rankPosts } from '@/lib/feedRanking';

const PAGE_SIZE = 30;

function PostSkeleton() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="relative h-full max-h-[calc(100dvh-11.5rem)] md:max-h-[calc(100dvh-7.5rem)] aspect-[9/16] animate-pulse">
        <div className="absolute inset-0 bg-sr-surface rounded-xl" />
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [reactedByMe, setReactedByMe] = useState<Record<string, boolean>>({});
  const [savedByMe, setSavedByMe] = useState<Record<string, boolean>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // Browsers block autoplay-with-sound until the user interacts with the
  // page, so every video starts muted. Tapping the sound icon once unmutes
  // it and every video after it for the rest of the session.
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPosts = useCallback(async (currentOffset: number, append: boolean) => {
    if (currentOffset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles(*)')
        .not('media_url', 'is', null)
        .in('media_type', ['photo', 'video'])
        .in('post_type', ['post', 'highlight'])
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + PAGE_SIZE - 1);

      if (error) { console.error('[ExplorePage] load failed:', error.message); return; }
      const raw = (data ?? []) as ExplorePost[];
      const ids = raw.map(p => p.id);

      const queries = [
        supabase.from('post_reactions').select('post_id, profile_id').in('post_id', ids),
        supabase.from('post_comments').select('post_id').in('post_id', ids),
      ];
      if (profile?.id) {
        queries.push(supabase.from('saved_posts').select('post_id').eq('profile_id', profile.id).in('post_id', ids));
      }
      const [reactRes, commentRes, savedRes] = await Promise.all(queries);

      const reactCounts: Record<string, number> = {};
      const myReacted: Record<string, boolean> = {};
      for (const r of (reactRes.data ?? []) as { post_id: string; profile_id: string }[]) {
        reactCounts[r.post_id] = (reactCounts[r.post_id] ?? 0) + 1;
        if (r.profile_id === profile?.id) myReacted[r.post_id] = true;
      }
      const cCounts: Record<string, number> = {};
      for (const c of (commentRes.data ?? []) as { post_id: string }[]) cCounts[c.post_id] = (cCounts[c.post_id] ?? 0) + 1;
      const mySaved: Record<string, boolean> = {};
      for (const s of (savedRes?.data ?? []) as { post_id: string }[]) mySaved[s.post_id] = true;

      const enriched = raw.map(p => ({
        ...p,
        reactionCount: reactCounts[p.id] ?? 0,
        commentCount: cCounts[p.id] ?? 0,
      }));

      // Personalized ordering — a real weighted mix (sport match,
      // following, engagement, recency, a touch of randomness) instead
      // of strict chronological order, so the feed genuinely feels like
      // a "For You" page rather than a plain timeline.
      let ranked = enriched;
      if (profile?.id) {
        const { data: followRows } = await supabase.from('follows').select('following_id').eq('follower_id', profile.id);
        const followingIds = new Set((followRows ?? []).map((r: { following_id: string }) => r.following_id));
        ranked = rankPosts(enriched, { viewerSport: profile.sport, followingIds });
      }

      setPosts(prev => append ? [...prev, ...ranked] : ranked);
      setReactedByMe(prev => append ? { ...prev, ...myReacted } : myReacted);
      setSavedByMe(prev => append ? { ...prev, ...mySaved } : mySaved);
      setCommentCounts(prev => append ? { ...prev, ...cCounts } : cCounts);
      setHasMore(raw.length === PAGE_SIZE);
      setOffset(currentOffset + raw.length);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [profile?.id]);

  // Re-load whenever the profile becomes available so the reacted/saved-by-me
  // state actually resolves against the right user (mirrors Feed page).
  useEffect(() => { loadPosts(0, false); }, [profile?.id]);

  // Live updates — a new post from anyone shows up here without needing a
  // reload, and a post someone (or an admin) deletes disappears
  // immediately for everyone currently browsing, not just after a refresh.
  useEffect(() => {
    const channel = supabase
      .channel('explore-posts-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async payload => {
        const newPost = payload.new as { id: string; media_url: string | null; media_type: string | null; post_type: string };
        // Only ever show posts that actually match Explore's own filter —
        // a text-only post or one still missing media shouldn't appear.
        if (!newPost.media_url || !['photo', 'video'].includes(newPost.media_type ?? '')) return;
        if (!['post', 'highlight'].includes(newPost.post_type)) return;

        const { data } = await supabase.from('posts').select('*, profiles(*)').eq('id', newPost.id).maybeSingle();
        if (!data) return;
        setPosts(prev => prev.some(p => p.id === newPost.id) ? prev : [{ ...(data as ExplorePost), reactionCount: 0, commentCount: 0 }, ...prev]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, payload => {
        const deletedId = (payload.old as { id: string }).id;
        setPosts(prev => prev.filter(p => p.id !== deletedId));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const idx = cardRefs.current.findIndex(el => el === visible.target);
          if (idx !== -1) setActiveIndex(idx);
        }
      },
      { root: containerRef.current, threshold: [0.6] },
    );
    cardRefs.current.forEach(el => el && obs.observe(el));
    return () => obs.disconnect();
  }, [posts.length]);

  useEffect(() => {
    if (!sentinelRef.current || !containerRef.current) return;
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadPosts(offset, true);
        }
      },
      { root: containerRef.current, rootMargin: '800px' },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loading, offset, loadPosts]);

  const scrollToIndex = (i: number) => {
    if (i < 0 || i >= cardRefs.current.length) return;
    cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 bg-sr-bg z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="p-1.5 text-sr-text-muted hover:text-white hover:bg-sr-surface-light rounded-lg transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-sr-purple" />
            <h1 className="text-lg font-bold text-white">Explore</h1>
          </div>
        </div>
        <p className="text-xs text-sr-text-muted">Athlete moments</p>
      </div>

      {/* Feed — one full-height item at a time, snap-scrolled */}
      {loading ? (
        <div className="flex-1"><PostSkeleton /></div>
      ) : posts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-sr-text-muted px-6">
          <div>
            <Compass className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-base font-medium text-white">No photos or videos yet</p>
            <p className="text-sm mt-1">Once athletes start sharing highlights, they'll show up here.</p>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            className="flex-1 overflow-y-scroll snap-y snap-mandatory"
            style={{ scrollbarWidth: 'none' }}
          >
            {posts.map((post, i) => (
              <div key={post.id} ref={el => { cardRefs.current[i] = el; }} className="h-full snap-start">
                <ExploreCard
                  post={post}
                  isActive={i === activeIndex}
                  muted={muted}
                  onToggleMute={() => setMuted(m => !m)}
                  initialReacted={!!reactedByMe[post.id]}
                  initialSaved={!!savedByMe[post.id]}
                  currentProfile={profile}
                  commentCount={commentCounts[post.id] ?? post.commentCount}
                  onCommentPosted={() => setCommentCounts(prev => ({ ...prev, [post.id]: (prev[post.id] ?? 0) + 1 }))}
                />
              </div>
            ))}

            {/* Infinite scroll sentinel + end-of-feed message, shown after the last card */}
            <div className="h-[40dvh] flex flex-col items-center justify-center gap-3 snap-start bg-sr-bg">
              <div ref={sentinelRef} />
              {loadingMore ? (
                <Loader2 className="h-6 w-6 text-sr-purple animate-spin" />
              ) : !hasMore ? (
                <p className="text-xs text-sr-text-muted text-center px-6">
                  You've reached the end — check back later for more
                </p>
              ) : null}
            </div>
          </div>

          {/* Prev/next nav arrows — Reels desktop style, far right of the viewport */}
          <div className="hidden lg:flex flex-col gap-3 absolute right-4 top-1/2 -translate-y-1/2 z-10">
            <button
              onClick={() => scrollToIndex(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="h-9 w-9 rounded-full bg-sr-surface-light/80 backdrop-blur-sm flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sr-surface-light transition-colors"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <button
              onClick={() => scrollToIndex(activeIndex + 1)}
              disabled={activeIndex >= posts.length - 1}
              className="h-9 w-9 rounded-full bg-sr-surface-light/80 backdrop-blur-sm flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sr-surface-light transition-colors"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
