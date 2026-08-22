import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { Select } from '@/components/ui/Select';
import { ShieldOff, Ban, CheckCircle2, MessageSquareWarning, Trash2, UserCog, Loader2, EyeOff } from 'lucide-react';

type EventKind = 'suspended' | 'banned' | 'released' | 'role_changed' | 'warning' | 'post_removed' | 'restricted';

interface AuditEvent {
  id: string;
  kind: EventKind;
  actorId: string | null;
  actorName: string;
  targetId: string;
  targetName: string;
  targetUsername: string;
  detail: string | null;
  createdAt: string;
}

const KIND_META: Record<EventKind, { icon: typeof ShieldOff; color: string; label: string }> = {
  suspended:     { icon: ShieldOff, color: 'text-yellow-400', label: 'Suspended' },
  banned:        { icon: Ban, color: 'text-red-400', label: 'Banned' },
  released:      { icon: CheckCircle2, color: 'text-green-400', label: 'Released' },
  role_changed:  { icon: UserCog, color: 'text-blue-400', label: 'Role Changed' },
  warning:       { icon: MessageSquareWarning, color: 'text-yellow-400', label: 'Warning' },
  post_removed:  { icon: Trash2, color: 'text-red-400', label: 'Post Removed' },
  restricted:    { icon: EyeOff, color: 'text-blue-400', label: 'Restricted' },
};

type PersonRef = { id?: string; first_name: string; last_name: string; username: string } | null;

/**
 * Every account-level action any admin has taken, in one place — the
 * thing Settings always claimed to have and never did. Pulls from
 * account_moderation_log (suspend/ban/release/role changes),
 * account_warnings, and post_removal_notices, merged into one timeline.
 * Dispute and flagged-content resolutions stay on their own dedicated
 * pages (Disputes, AI Flagged) where they already have full context —
 * this is specifically the cross-cutting "what has been done to whom"
 * view.
 */
export function AdminAuditLog() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [kindFilter, setKindFilter] = useState<EventKind | 'all'>('all');

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError('');

      const [logRes, warningsRes, removalsRes] = await Promise.all([
        supabase
          .from('account_moderation_log')
          .select('id, action, reason, created_at, profile_id, performed_by:performed_by(id, first_name, last_name, username), target:profile_id(first_name, last_name, username)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('account_warnings')
          .select('id, reason, created_at, profile_id, issued_by:issued_by(id, first_name, last_name, username), target:profile_id(first_name, last_name, username)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('post_removal_notices')
          .select('id, reason, post_caption, created_at, profile_id, removed_by:removed_by(id, first_name, last_name, username), target:profile_id(first_name, last_name, username)')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (logRes.error) { setError(logRes.error.message); setIsLoading(false); return; }
      if (warningsRes.error) { setError(warningsRes.error.message); setIsLoading(false); return; }
      if (removalsRes.error) { setError(removalsRes.error.message); setIsLoading(false); return; }

      const logEvents: AuditEvent[] = ((logRes.data ?? []) as unknown as {
        id: string; action: EventKind; reason: string | null; created_at: string; profile_id: string;
        performed_by: PersonRef; target: PersonRef;
      }[]).map(r => ({
        id: `log-${r.id}`, kind: r.action, actorId: r.performed_by?.id ?? null,
        actorName: r.performed_by ? `${fullName(r.performed_by as never)}` : 'unknown',
        targetId: r.profile_id, targetName: r.target ? fullName(r.target as never) : 'unknown',
        targetUsername: r.target?.username ?? '', detail: r.reason, createdAt: r.created_at,
      }));

      const warningEvents: AuditEvent[] = ((warningsRes.data ?? []) as unknown as {
        id: string; reason: string; created_at: string; profile_id: string; issued_by: PersonRef; target: PersonRef;
      }[]).map(r => ({
        id: `warn-${r.id}`, kind: 'warning', actorId: r.issued_by?.id ?? null,
        actorName: r.issued_by ? fullName(r.issued_by as never) : 'unknown',
        targetId: r.profile_id, targetName: r.target ? fullName(r.target as never) : 'unknown',
        targetUsername: r.target?.username ?? '', detail: r.reason, createdAt: r.created_at,
      }));

      const removalEvents: AuditEvent[] = ((removalsRes.data ?? []) as unknown as {
        id: string; reason: string; post_caption: string | null; created_at: string; profile_id: string; removed_by: PersonRef; target: PersonRef;
      }[]).map(r => ({
        id: `removal-${r.id}`, kind: 'post_removed', actorId: r.removed_by?.id ?? null,
        actorName: r.removed_by ? fullName(r.removed_by as never) : 'unknown',
        targetId: r.profile_id, targetName: r.target ? fullName(r.target as never) : 'unknown',
        targetUsername: r.target?.username ?? '', detail: r.reason, createdAt: r.created_at,
      }));

      const merged = [...logEvents, ...warningEvents, ...removalEvents]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEvents(merged);
      setIsLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return events.filter(ev => {
      if (kindFilter !== 'all' && ev.kind !== kindFilter) return false;
      if (onlyMine && ev.actorId !== profile?.id) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${ev.targetName} ${ev.targetUsername} ${ev.actorName} ${ev.detail ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, kindFilter, onlyMine, search, profile?.id]);

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-white">Audit Log</h3>
        <label className="flex items-center gap-1.5 text-xs text-sr-text-muted cursor-pointer">
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
          My actions only
        </label>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, username, reason..."
          className="input-dark !w-56 text-xs py-1.5" />
        <div className="w-40">
          <Select value={kindFilter} onChange={v => setKindFilter(v as EventKind | 'all')}
            options={[{ value: 'all', label: 'All action types' }, ...(Object.keys(KIND_META) as EventKind[]).map(k => ({ value: k, label: KIND_META[k].label }))]}
            className="text-xs" />
        </div>
      </div>

      {error && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 text-sr-purple animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-sr-text-muted text-center py-8">No matching actions.</p>
      ) : (
        <div className="space-y-2 max-h-[28rem] overflow-y-auto">
          {filtered.map(ev => {
            const meta = KIND_META[ev.kind];
            const Icon = meta.icon;
            return (
              <div key={ev.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-sr-surface border border-sr-border">
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${meta.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white">
                    <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
                    {' — '}
                    {ev.targetUsername ? (
                      <Link to={`/profile/${ev.targetUsername}`} className="hover:text-sr-purple-light">{ev.targetName}</Link>
                    ) : ev.targetName}
                    <span className="text-sr-text-muted"> by {ev.actorName}</span>
                  </p>
                  {ev.detail && <p className="text-xs text-sr-text-muted mt-0.5">{ev.detail}</p>}
                </div>
                <span className="text-[10px] text-sr-text-muted flex-shrink-0">{timeAgo(ev.createdAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
