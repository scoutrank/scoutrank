import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { ArrowLeft, Loader2, AlertCircle, ShieldCheck, Check, X } from 'lucide-react';

interface ApplicationRow {
  id: string;
  profile_id: string;
  full_legal_name: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profiles: { first_name: string; last_name: string; username: string } | null;
}

export default function AdminSellerApplicationsPage() {
  const { isAdmin, profile } = useAuth();
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;
  }

  const load = async () => {
    setIsLoading(true);
    setError('');
    let q = supabase
      .from('seller_applications')
      .select('id, profile_id, full_legal_name, reason, status, created_at, profiles:profile_id(first_name, last_name, username)')
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error: qErr } = await q;
    if (qErr) { setError(qErr.message); setIsLoading(false); return; }
    setApplications((data as unknown as ApplicationRow[]) ?? []);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const resolve = async (row: ApplicationRow, decision: 'approved' | 'rejected') => {
    if (!profile) return;
    setActioning(row.id);
    setError('');

    const { error: profileErr } = await supabase.from('profiles').update({ seller_status: decision }).eq('id', row.profile_id);
    if (profileErr) { setError(profileErr.message); setActioning(null); return; }

    const { error: appErr } = await supabase.from('seller_applications')
      .update({ status: decision, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq('id', row.id);
    setActioning(null);
    if (appErr) { setError(appErr.message); return; }
    setApplications(prev => prev.map(a => a.id === row.id ? { ...a, status: decision } : a));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="h-7 w-7 text-sr-purple-light" />
        <h1 className="text-2xl font-bold text-white">Seller Applications</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">{applications.length} shown</span>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
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
      ) : applications.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <ShieldCheck className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold mb-1">No {statusFilter === 'all' ? '' : statusFilter} applications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map(a => (
            <div key={a.id} className="card-premium p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <p className="text-sm font-semibold text-white">{a.full_legal_name}</p>
                  {a.profiles && (
                    <Link to={`/profile/${a.profiles.username}`} className="text-xs text-sr-purple-light hover:text-white">
                      {fullName(a.profiles)} (@{a.profiles.username})
                    </Link>
                  )}
                </div>
                <span className="text-[10px] text-sr-text-muted flex-shrink-0">{timeAgo(a.created_at)}</span>
              </div>
              {a.reason && <p className="text-xs text-sr-silver mb-3">{a.reason}</p>}
              {a.status !== 'pending' ? (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                  a.status === 'approved' ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'
                }`}>{a.status}</span>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => resolve(a, 'approved')} disabled={actioning === a.id}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50">
                    {actioning === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                  </button>
                  <button onClick={() => resolve(a, 'rejected')} disabled={actioning === a.id}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                    <X className="h-3.5 w-3.5" /> Reject
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
