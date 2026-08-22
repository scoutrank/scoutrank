import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, fullName } from '@/lib/supabase';
import type { PostComment, Profile } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { X, Send, Loader2 } from 'lucide-react';

interface CommentSheetProps {
  postId: string;
  open: boolean;
  onClose: () => void;
  currentProfileId: string | undefined;
  onCommentPosted?: () => void;
  postOwnerId?: string;
  isAdmin?: boolean;
}

/**
 * Comment panel scoped to the video/photo card it's attached to — covers
 * the bottom third of that card (not the whole screen). Must be rendered
 * inside a `relative`-positioned parent (the card itself).
 */
export function CommentSheet({ postId, open, onClose, currentProfileId, onCommentPosted, postOwnerId, isAdmin }: CommentSheetProps) {
  const [comments, setComments] = useState<(PostComment & { profiles: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadComments = () => {
    setLoading(true);
    supabase
      .from('post_comments')
      .select('*, profiles(*)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('[CommentSheet] Failed to load comments:', error.message);
        setComments((data as unknown as (PostComment & { profiles: Profile })[] | null) ?? []);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (open) loadComments();
  }, [open, postId]);

  const handlePost = async () => {
    if (!text.trim() || posting || !currentProfileId) return;
    setPosting(true);
    const content = text;
    const { data: inserted, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, profile_id: currentProfileId, content })
      .select('id')
      .single();
    setPosting(false);
    if (error) {
      console.error('[CommentSheet] Failed to post comment:', error.message);
      return;
    }
    if (inserted) {
      supabase.functions.invoke('moderate-comment', { body: { commentId: (inserted as { id: string }).id } })
        .then(({ error: modErr }) => { if (modErr) console.error('[moderation] Comment scan failed:', modErr.message); });
    }
    setText('');
    loadComments();
    onCommentPosted?.();
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
    if (error) { console.error('[CommentSheet] Failed to delete comment:', error.message); return; }
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Dims just the video area above the panel, within this card only */}
          <motion.div
            className="absolute inset-0 bg-black/50 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => { e.stopPropagation(); onClose(); }}
          />
          {/* Panel — bottom third of the card */}
          <motion.div
            className="absolute left-0 right-0 bottom-0 z-40 bg-sr-surface border-t border-sr-border rounded-t-2xl flex flex-col"
            style={{ height: '33%' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle + header */}
            <div className="flex-shrink-0 pt-2 pb-1.5 border-b border-sr-border relative">
              <div className="w-8 h-1 rounded-full bg-sr-border mx-auto mb-1.5" />
              <div className="flex items-center justify-center">
                <h2 className="text-xs font-bold text-white">Comments</h2>
              </div>
              <button onClick={onClose} className="absolute right-2 top-1 p-1 text-sr-text-muted hover:text-white rounded-lg">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Comment list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2.5">
              {loading ? (
                <div className="flex justify-center py-3">
                  <Loader2 className="h-4 w-4 text-sr-purple animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-center text-xs text-sr-text-muted py-3">No comments yet. Be the first!</p>
              ) : (
                comments.map(c => {
                  const canDelete = c.profile_id === currentProfileId || postOwnerId === currentProfileId || isAdmin;
                  return (
                  <div key={c.id} className="flex items-start gap-2">
                    <Link to={`/profile/${c.profiles.username}`} className="flex-shrink-0">
                      <div className="h-6 w-6 rounded-full overflow-hidden bg-gradient-to-br from-sr-purple to-sr-blue">
                        {c.profiles.avatar_url ? (
                          <img src={c.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-white text-[9px] font-bold">
                            {c.profiles.first_name?.[0]}{c.profiles.last_name?.[0]}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <Link to={`/profile/${c.profiles.username}`} className="text-xs font-semibold text-white hover:underline">
                          {fullName(c.profiles)}
                        </Link>
                        <span className="text-[9px] text-sr-text-muted flex-shrink-0">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-xs text-sr-silver break-words">{c.content}</p>
                    </div>
                    {canDelete && (
                      <button onClick={() => handleDelete(c.id)} className="flex-shrink-0 p-1 text-sr-text-muted hover:text-red-400 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  );
                })
              )}
            </div>

            {/* Composer */}
            <div className="flex-shrink-0 p-2 border-t border-sr-border flex items-center gap-1.5">
              <input
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handlePost(); }}
                placeholder="Add a comment..."
                className="input-dark flex-1 py-1.5 text-xs"
              />
              <button
                onClick={handlePost}
                disabled={!text.trim() || posting}
                className="h-7 w-7 rounded-full bg-sr-purple flex items-center justify-center text-white disabled:opacity-40 flex-shrink-0"
              >
                {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
