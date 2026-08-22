import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, X } from 'lucide-react';

interface WarningRow {
  id: string;
  reason: string;
  created_at: string;
}

/** Same pattern as PostRemovalNoticeModal, for a lighter-touch warning rather than a removed post. */
export function AccountWarningModal() {
  const { profile } = useAuth();
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('account_warnings')
      .select('id, reason, created_at')
      .eq('profile_id', profile.id)
      .eq('acknowledged', false)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('[AccountWarning] Failed to load:', error.message); return; }
        setWarnings((data as WarningRow[] | null) ?? []);
      });

    const channel = supabase
      .channel(`account-warnings-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'account_warnings', filter: `profile_id=eq.${profile.id}` }, payload => {
        setWarnings(prev => [...prev, payload.new as WarningRow]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  if (warnings.length === 0) return null;
  const current = warnings[0];

  const dismiss = async () => {
    setDismissing(true);
    const { error } = await supabase.from('account_warnings').update({ acknowledged: true }).eq('id', current.id);
    setDismissing(false);
    if (error) { console.error('[AccountWarning] Failed to acknowledge:', error.message); return; }
    setWarnings(prev => prev.slice(1));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm card-premium p-6">
        <div className="h-11 w-11 rounded-xl bg-yellow-500/15 flex items-center justify-center mb-4">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
        </div>
        <h2 className="text-lg font-bold text-white mb-3">You've received a warning</h2>
        <p className="text-xs text-sr-text-muted uppercase tracking-wide mb-1">Reason</p>
        <p className="text-sm text-sr-silver mb-6">{current.reason}</p>
        <button onClick={dismiss} disabled={dismissing}
          className="w-full py-2.5 rounded-lg bg-sr-purple text-white text-sm font-medium hover:bg-sr-purple/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
          <X className="h-4 w-4" /> Understood
        </button>
        {warnings.length > 1 && (
          <p className="text-[10px] text-sr-text-muted text-center mt-3">{warnings.length - 1} more warning{warnings.length > 2 ? 's' : ''} after this</p>
        )}
      </div>
    </div>
  );
}
