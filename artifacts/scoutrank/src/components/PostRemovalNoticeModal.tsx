import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, X } from 'lucide-react';

interface NoticeRow {
  id: string;
  post_caption: string | null;
  reason: string;
  created_at: string;
}

/**
 * Checks for any of the current user's posts that were removed by an
 * admin and haven't been shown yet, and displays them one at a time as a
 * blocking pop-up with the real reason — included once in the main
 * Layout, so it surfaces on whatever page the person next loads.
 */
export function PostRemovalNoticeModal() {
  const { profile } = useAuth();
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('post_removal_notices')
      .select('id, post_caption, reason, created_at')
      .eq('profile_id', profile.id)
      .eq('acknowledged', false)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('[PostRemovalNotice] Failed to load:', error.message); return; }
        setNotices((data as NoticeRow[] | null) ?? []);
      });

    const channel = supabase
      .channel(`post-removal-notices-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_removal_notices', filter: `profile_id=eq.${profile.id}` }, payload => {
        setNotices(prev => [...prev, payload.new as NoticeRow]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  if (notices.length === 0) return null;
  const current = notices[0];

  const dismiss = async () => {
    setDismissing(true);
    const { error } = await supabase.from('post_removal_notices').update({ acknowledged: true }).eq('id', current.id);
    setDismissing(false);
    if (error) { console.error('[PostRemovalNotice] Failed to acknowledge:', error.message); return; }
    setNotices(prev => prev.slice(1));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm card-premium p-6">
        <div className="h-11 w-11 rounded-xl bg-red-500/15 flex items-center justify-center mb-4">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-white mb-1">A post of yours was removed</h2>
        {current.post_caption && (
          <p className="text-xs text-sr-text-muted mb-3 italic line-clamp-2">"{current.post_caption}"</p>
        )}
        <p className="text-xs text-sr-text-muted uppercase tracking-wide mb-1">Reason</p>
        <p className="text-sm text-sr-silver mb-6">{current.reason}</p>
        <button onClick={dismiss} disabled={dismissing}
          className="w-full py-2.5 rounded-lg bg-sr-purple text-white text-sm font-medium hover:bg-sr-purple/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
          <X className="h-4 w-4" /> Understood
        </button>
        {notices.length > 1 && (
          <p className="text-[10px] text-sr-text-muted text-center mt-3">{notices.length - 1} more notice{notices.length > 2 ? 's' : ''} after this</p>
        )}
      </div>
    </div>
  );
}
