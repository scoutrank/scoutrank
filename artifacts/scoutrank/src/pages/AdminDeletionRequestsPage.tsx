import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { Trash2, Loader2, AlertCircle, ArrowLeft, UserX } from 'lucide-react';

interface RequestRow {
  id: string;
  profile_id: string;
  reason: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
  profiles: { username: string; first_name: string; last_name: string } | null;
}

/**
 * Someone requesting deletion doesn't get deleted immediately — it queues
 * here for an admin to actually complete, since real deletion needs the
 * service role key (see the delete-account Edge Function) and is
 * irreversible, so a deliberate second step makes sense either way.
 */
export default function AdminDeletionRequestsPage() {
  const { isAdmin } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'completed' | 'all'>('pending');

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;
  }

  const load = async () => {
    setIsLoading(true);
    setError('');
    let q = supabase
      .from('account_deletion_requests')
      .select('id, profile_id, reason, status, created_at, profiles:profile_id(username, first_name, last_name)')
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error: qErr } = await q;
    if (qErr) { setError(qErr.message); setIsLoading(false); return; }
    setRequests((data as unknown as RequestRow[]) ?? []);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const completeDeletion = async (req: RequestRow) => {
    if (!confirm(`This permanently deletes ${req.profiles ? fullName(req.profiles) : 'this account'} and everything they've posted. This cannot be undone. Continue?`)) return;
    setActioning(req.id);
    setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('delete-account', {
      body: { requestId: req.id, targetUserId: req.profile_id },
    });
    setActioning(null);
    if (fnErr) {
      let detail = fnErr.message;
      const context = (fnErr as { context?: Response }).context;
      if (context && typeof context.json === 'function') {
        try { const body = await context.clone().json(); if (body?.error) detail = body.error; } catch { /* fall back to generic message */ }
      }
      setError(`Failed to delete account: ${detail}`);
      return;
    }
    if (data?.error) { setError(`Failed to delete account: ${data.error}`); return; }
    setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'completed' } : r));
  };

  const cancelRequest = async (req: RequestRow) => {
    setActioning(req.id);
    const { error: err } = await supabase.from('account_deletion_requests').update({ status: 'cancelled' }).eq('id', req.id);
    setActioning(null);
    if (err) { setError(err.message); return; }
    setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'cancelled' } as RequestRow : r));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <UserX className="h-7 w-7 text-red-400" />
        <h1 className="text-2xl font-bold text-white">Account Deletion Requests</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">{requests.length} shown</span>
      </div>
      <p className="text-sm text-sr-text-muted mb-6">
        Someone requesting deletion doesn't delete their account immediately — approving here permanently removes them and everything they've posted. Not reversible.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(['pending', 'completed', 'all'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors ${
              statusFilter === s ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <UserX className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold mb-1">No {statusFilter === 'all' ? '' : statusFilter} deletion requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="card-premium p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                    r.status === 'pending' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                    r.status === 'completed' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                    'text-sr-text-muted bg-sr-surface border-sr-border'
                  }`}>{r.status}</span>
                  <span className="text-xs text-sr-text-muted">{timeAgo(r.created_at)}</span>
                </div>
                <p className="text-sm font-medium text-white">{r.profiles ? `${fullName(r.profiles)} (@${r.profiles.username})` : 'Unknown account'}</p>
                {r.reason && <p className="text-xs text-sr-silver mt-1">"{r.reason}"</p>}
              </div>
              {r.status === 'pending' && (
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => cancelRequest(r)} disabled={actioning === r.id}
                    className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30 disabled:opacity-50">
                    Cancel Request
                  </button>
                  <button onClick={() => completeDeletion(r)} disabled={actioning === r.id}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                    {actioning === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Approve &amp; Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
