import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { timeAgo } from '@/utils/time';
import { ArrowLeft, Loader2, AlertCircle, Building2, Check, X } from 'lucide-react';

interface ClaimRow {
  id: string;
  claim_type: 'claim' | 'register';
  organisation_id: string | null;
  official_email: string;
  applicant_name: string;
  applicant_position: string;
  proof_details: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  new_org_name: string | null;
  new_org_type: string | null;
  new_org_sports: string[] | null;
  new_org_country: string | null;
  new_org_state: string | null;
  new_org_city: string | null;
  new_org_website: string | null;
  claimant: { first_name: string; last_name: string; username: string } | null;
  organisations: { name: string } | null;
}

export default function AdminOrganisationClaimsPage() {
  const { isAdmin, profile } = useAuth();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  if (!isAdmin) return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;

  const load = () => {
    setIsLoading(true);
    setError('');
    let q = supabase.from('organisation_claims')
      .select('*, claimant:claimant_id(first_name, last_name, username), organisations(name)')
      .order('created_at', { ascending: false });
    if (statusFilter === 'pending') q = q.eq('status', 'pending');
    q.then(({ data, error: qErr }) => {
      if (qErr) { setError(qErr.message); setIsLoading(false); return; }
      setClaims((data as unknown as ClaimRow[]) ?? []);
      setIsLoading(false);
    });
  };

  useEffect(() => { load(); }, [statusFilter]);

  const approve = async (claim: ClaimRow) => {
    setActioning(claim.id);
    setError('');
    const { data, error: err } = await supabase.functions.invoke('review-organisation-claim', { body: { claimId: claim.id, action: 'approve' } });
    setActioning(null);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Failed to approve.'); return; }
    setClaims(prev => prev.map(c => c.id === claim.id ? { ...c, status: 'approved' } : c));
  };

  const reject = async (claim: ClaimRow) => {
    setActioning(claim.id);
    setError('');
    const { data, error: err } = await supabase.functions.invoke('review-organisation-claim', { body: { claimId: claim.id, action: 'reject', rejectionReason: rejectionReason.trim() || undefined } });
    setActioning(null);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Failed to reject.'); return; }
    setClaims(prev => prev.map(c => c.id === claim.id ? { ...c, status: 'rejected' } : c));
    setRejectingId(null);
    setRejectionReason('');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="h-7 w-7 text-sr-purple-light" />
        <h1 className="text-2xl font-bold text-white">Club Claim / Register Applications</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(['pending', 'all'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-lg border capitalize ${statusFilter === s ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted'}`}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : claims.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold">No {statusFilter === 'all' ? '' : statusFilter} applications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map(c => (
            <div key={c.id} className="card-premium p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase mr-2 ${c.claim_type === 'register' ? 'bg-sr-blue/15 text-sr-blue' : 'bg-sr-purple/15 text-sr-purple-light'}`}>
                    {c.claim_type}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {c.claim_type === 'claim' ? c.organisations?.name : c.new_org_name}
                  </span>
                  {c.claim_type === 'register' && (
                    <p className="text-xs text-sr-text-muted mt-0.5">
                      {c.new_org_type} · {[c.new_org_city, c.new_org_state, c.new_org_country].filter(Boolean).join(', ')}
                      {c.new_org_sports?.length ? ` · ${c.new_org_sports.join(', ')}` : ''}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-sr-text-muted flex-shrink-0">{timeAgo(c.created_at)}</span>
              </div>

              <div className="text-xs text-sr-silver space-y-1 mb-3">
                <p><span className="text-sr-text-muted">Applicant:</span> {c.applicant_name} — {c.applicant_position} {c.claimant && `(@${c.claimant.username})`}</p>
                <p><span className="text-sr-text-muted">Email:</span> {c.official_email}</p>
                {c.new_org_website && <p><span className="text-sr-text-muted">Website:</span> {c.new_org_website}</p>}
                {c.proof_details && <p className="text-sr-silver bg-sr-surface rounded-lg p-2 mt-1.5">{c.proof_details}</p>}
              </div>

              {c.status !== 'pending' ? (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                  c.status === 'approved' ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'
                }`}>{c.status}</span>
              ) : rejectingId === c.id ? (
                <div className="mt-2">
                  <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={2}
                    className="input-dark w-full resize-none text-xs mb-2" placeholder="Reason for rejecting (optional)" />
                  <div className="flex gap-2">
                    <button onClick={() => setRejectingId(null)} className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted">Cancel</button>
                    <button onClick={() => reject(c)} disabled={actioning === c.id}
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">Confirm Reject</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => approve(c)} disabled={actioning === c.id}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50">
                    {actioning === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                  </button>
                  <button onClick={() => setRejectingId(c.id)} disabled={actioning === c.id}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-red-500/30 hover:text-red-400">
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
