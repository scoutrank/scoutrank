import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Compass, Loader2 } from 'lucide-react';
import { ExploreCard, type ExplorePost } from '@/components/ExploreCard';

export default function SinglePostViewPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [post, setPost] = useState<ExplorePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    setNotFound(false);

    (async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles(*)')
        .eq('id', postId)
        .maybeSingle();

      if (error || !data) {
        console.error('[SinglePostViewPage] load failed:', error?.message);
        setNotFound(true);
        setLoading(false);
        return;
      }

      const queries = [
        supabase.from('post_reactions').select('profile_id').eq('post_id', postId),
        supabase.from('post_comments').select('id', { count: 'exact', head: true }).eq('post_id', postId),
      ];
      if (profile?.id) {
        queries.push(supabase.from('saved_posts').select('id').eq('post_id', postId).eq('profile_id', profile.id).maybeSingle());
      }
      const [reactRes, commentRes, savedRes] = await Promise.all(queries);

      const reactRows = (reactRes.data ?? []) as { profile_id: string }[];
      setPost({
        ...(data as ExplorePost),
        reactionCount: reactRows.length,
        commentCount: commentRes.count ?? 0,
      });
      setReacted(reactRows.some(r => r.profile_id === profile?.id));
      setCommentCount(commentRes.count ?? 0);
      setSaved(!!(savedRes as { data: unknown } | undefined)?.data);
      setLoading(false);
    })();
  }, [postId, profile?.id]);

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
            <h1 className="text-lg font-bold text-white">Saved</h1>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-sr-purple animate-spin" />
        </div>
      ) : notFound || !post ? (
        <div className="flex-1 flex items-center justify-center text-center text-sr-text-muted px-6">
          <div>
            <Compass className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-base font-medium text-white">Post not found</p>
            <p className="text-sm mt-1">It may have been deleted.</p>
          </div>
        </div>
      ) : (
        <div className="h-[calc(100dvh-7.25rem)] relative">
          <ExploreCard
            post={post}
            isActive
            muted={muted}
            onToggleMute={() => setMuted(m => !m)}
            initialReacted={reacted}
            initialSaved={saved}
            currentProfile={profile}
            commentCount={commentCount}
            onCommentPosted={() => setCommentCount(c => c + 1)}
          />
        </div>
      )}
    </div>
  );
}
