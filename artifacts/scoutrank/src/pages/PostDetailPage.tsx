import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { FeedPostCard } from '@/pages/FeedPage';
import type { FeedPost } from '@/pages/FeedPage';
import { Loader2, ArrowLeft } from 'lucide-react';

// Permanent, shareable single-post view at /post/:id — reuses the exact
// same FeedPostCard component the main Feed uses (reactions, comments,
// replies, save, delete all come for free, no duplicated logic) and
// queries the same `posts` table by its real, permanent id. Notifications
// and saved posts can link here later using the same `post.id` they
// already have — no separate "share id" or duplicated record anywhere.
export default function PostDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const highlightCommentId = searchParams.get('highlight');
  const [post, setPost] = useState<FeedPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);
  const [reacted, setReacted] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setIsLoading(true);
    setNotFound(false);

    supabase
      .from('posts')
      .select('*, profiles(*)')
      .eq('id', id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) console.error('Failed to load post:', error.message);
        const loaded = (data as unknown as FeedPost | null) ?? null;
        if (!loaded) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
        setPost(loaded);

        // Same batched-initial-state approach as the main feed, just
        // scoped to this one post instead of 50.
        const [reactionsRes, commentsRes, savedRes] = await Promise.all([
          supabase.from('post_reactions').select('profile_id').eq('post_id', loaded.id),
          supabase.from('post_comments').select('id', { count: 'exact', head: true }).eq('post_id', loaded.id),
          profile?.id
            ? supabase.from('saved_posts').select('id', { count: 'exact', head: true }).eq('post_id', loaded.id).eq('profile_id', profile.id)
            : Promise.resolve({ count: 0 }),
        ]);

        if (!active) return;
        const reactionRows = (reactionsRes.data as { profile_id: string }[] | null) ?? [];
        setReactionCount(reactionRows.length);
        setReacted(reactionRows.some(r => r.profile_id === profile?.id));
        setCommentCount(commentsRes.count ?? 0);
        setSaved((savedRes.count ?? 0) > 0);
        setIsLoading(false);
      });

    return () => { active = false; };
  }, [id, profile?.id]);

  // React Router gives every navigated-to location a unique `key` —
  // except the very first entry in a session, which is always "default".
  // That means: if key is "default", this page was the entry point
  // (e.g. a shared link opened directly), so there's nowhere real to
  // go "back" to within the app — fall back to Feed instead of leaving
  // the app or landing somewhere broken.
  const handleBack = () => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/feed');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-sr-purple animate-spin" />
      </div>
    );
  }

  if (notFound || !post || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Post not found</h1>
        <p className="text-sm text-sr-text-muted mb-6">This post may have been deleted by its owner.</p>
        <Link to="/feed" className="text-sr-purple-light hover:underline text-sm">← Back to Feed</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={handleBack} className="inline-flex items-center gap-1.5 text-sm text-sr-text-muted hover:text-white mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <FeedPostCard
        post={post}
        currentProfileId={profile.id}
        currentProfileName={fullName(profile)}
        currentProfileUsername={profile.username}
        currentProfileAvatar={`${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`}
        initialReactionCount={reactionCount}
        initialReacted={reacted}
        initialCommentCount={commentCount}
        initialSaved={saved}
        highlightCommentId={highlightCommentId}
        onPostDeleted={() => setNotFound(true)}
      />
    </div>
  );
}
