import { useState, useEffect } from 'react';
import { supabase, fullName } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { X, Loader2, ShieldOff, Ban, MessageSquareWarning, CheckCircle2, EyeOff } from 'lucide-react';

interface HistoryEvent {
  id: string;
  kind: 'suspended' | 'banned' | 'released' | 'warning' | 'restricted';
  reason: string | null;
  suspendedUntil?: string | null;
  performedByName: string;
  createdAt: string;
}

const KIND_STYLES: Record<HistoryEvent['kind'], { icon: typeof ShieldOff; color: string; label: string }> = {
  suspended:  { icon: ShieldOff, color: 'text-yellow-400', label: 'Suspended' },
  banned:     { icon: Ban, color: 'text-red-400', label: 'Banned' },
  released:   { icon: CheckCircle2, color: 'text-green-400', label: 'Released' },
  warning:    { icon: MessageSquareWarning, color: 'text-yellow-400', label: 'Warning' },
  restricted: { icon: EyeOff, color: 'text-blue-400', label: 'Restricted' },
};

/**
 * Full moderation history for one account — every suspend/ban/release
 * from account_moderation_log plus every warning from account_warnings,
 * merged into a single timeline. Meant to answer exactly one question
 * for whichever admin picks up a new report: has this account been dealt
 * with before, and why?
 */
export function AccountHistoryModal({ targetUserId, targetName, onClose }: { targetUserId: string; targetName: string; onClose: () => void }) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError('');

      const [logRes, warningsRes] = await Promise.all([
        supabase
          .from('account_moderation_log')
          .select('id, action, reason, suspended_until, created_at, performed_by:performed_by(first_name, last_name, username)')
          .eq('profile_id', targetUserId)
          .in('action', ['suspended', 'banned', 'released', 'restricted'])
          .order('created_at', { ascending: false }),
        supabase
          .from('account_warnings')
          .select('id, reason, created_at, issued_by:issued_by(first_name, last_name, username)')
          .eq('profile_id', targetUserId)
          .order('created_at', { ascending: false }),
      ]);

      if (logRes.error) { setError(logRes.error.message); setIsLoading(false); return; }
      if (warningsRes.error) { setError(warningsRes.error.message); setIsLoading(false); return; }

      type PersonRef = { first_name: string; last_name: string; username: string } | null;
      const logEvents: HistoryEvent[] = ((logRes.data ?? []) as unknown as {
        id: string; action: HistoryEvent['kind']; reason: string | null; suspended_until: string | null; created_at: string; performed_by: PersonRef;
      }[]).map(r => ({
        id: r.id, kind: r.action, reason: r.reason, suspendedUntil: r.suspended_until,
        performedByName: r.performed_by ? `${fullName(r.performed_by as never)} (@${r.performed_by.username})` : 'unknown',
        createdAt: r.created_at,
      }));
      const warningEvents: HistoryEvent[] = ((warningsRes.data ?? []) as unknown as {
        id: string; reason: string; created_at: string; issued_by: PersonRef;
      }[]).map(r => ({
        id: r.id, kind: 'warning', reason: r.reason, performedByName: r.issued_by ? `${fullName(r.issued_by as never)} (@${r.issued_by.username})` : 'unknown',
        createdAt: r.created_at,
      }));

      const merged = [...logEvents, ...warningEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEvents(merged);
      setIsLoading(false);
    })();
  }, [targetUserId]);

  const totalActions = events.filter(e => e.kind !== 'released').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md card-premium p-5 max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-white">History — {targetName}</h3>
          <button onClick={onClose} className="text-sr-text-muted hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-sr-text-muted mb-4">
          {isLoading ? 'Loading...' : totalActions === 0 ? 'No prior warnings, suspensions, or bans.' : `${totalActions} prior action${totalActions === 1 ? '' : 's'} on this account.`}
        </p>

        {error && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>}

        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 text-sr-purple animate-spin" /></div>
          ) : events.length === 0 ? (
            <p className="text-xs text-sr-text-muted text-center py-8">Clean record — first time this account has come up.</p>
          ) : (
            events.map(ev => {
              const style = KIND_STYLES[ev.kind] ?? { icon: ShieldOff, color: 'text-sr-text-muted', label: ev.kind };
              const Icon = style.icon;
              return (
                <div key={ev.id} className="p-3 rounded-lg bg-sr-surface border border-sr-border">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${style.color}`} />
                    <span className={`text-xs font-semibold ${style.color}`}>{style.label}</span>
                    <span className="text-[10px] text-sr-text-muted ml-auto">{timeAgo(ev.createdAt)}</span>
                  </div>
                  {ev.reason && <p className="text-xs text-sr-silver mb-1">{ev.reason}</p>}
                  {ev.suspendedUntil && <p className="text-[10px] text-sr-text-muted mb-1">Until {new Date(ev.suspendedUntil).toLocaleDateString()}</p>}
                  <p className="text-[10px] text-sr-text-muted">By {ev.performedByName}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
