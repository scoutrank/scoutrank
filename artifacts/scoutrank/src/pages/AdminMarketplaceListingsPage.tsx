import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { Loader2, AlertCircle, ShoppingBag, Check, X } from 'lucide-react';
import { AdminTopNav } from '@/components/layout/AdminTopNav';

interface ReviewRow {
  id: string;
  listing_id: string;
  ai_reasoning: string | null;
  status: 'open' | 'resolved';
  resolution: string | null;
  created_at: string;
  marketplace_listings: {
    title: string;
    description: string | null;
    category: string;
    price_cents: number;
    currency: string;
    status: string;
    profiles: { first_name: string; last_name: string; username: string } | null;
  } | null;
}

/**
 * Listings the AI reviewer wasn't confident enough to auto-approve —
 * either a real appropriateness concern, or something too vague/generic
 * to confidently wave through. A human makes the actual call either way.
 */
export default function AdminMarketplaceListingsPage() {
  const { isAdmin, profile } = useAuth();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>('open');

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;
  }

  const load = async () => {
    setIsLoading(true);
    setError('');
    let q = supabase
      .from('marketplace_listing_reviews')
      .select('id, listing_id, ai_reasoning, status, resolution, created_at, marketplace_listings(title, description, category, price_cents, currency, status, profiles:seller_id(first_name, last_name, username))')
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error: qErr } = await q;
    if (qErr) { setError(qErr.message); setIsLoading(false); return; }
    setReviews((data as unknown as ReviewRow[]) ?? []);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const resolve = async (row: ReviewRow, resolution: 'approved' | 'rejected') => {
    if (!profile) return;
    setActioning(row.id);
    setError('');

    const { error: listingErr } = await supabase.from('marketplace_listings')
      .update({ status: resolution === 'approved' ? 'active' : 'rejected' })
      .eq('id', row.listing_id);
    if (listingErr) { setError(listingErr.message); setActioning(null); return; }

    const { error: reviewErr } = await supabase.from('marketplace_listing_reviews')
      .update({ status: 'resolved', resolution, resolved_by: profile.id, resolved_at: new Date().toISOString() })
      .eq('id', row.id);
    setActioning(null);
    if (reviewErr) { setError(reviewErr.message); return; }
    setReviews(prev => prev.map(r => r.id === row.id ? { ...r, status: 'resolved', resolution } : r));
  };

  return (
    <div className="min-h-screen bg-sr-bg">
      <AdminTopNav />
      <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingBag className="h-7 w-7 text-sr-purple-light" />
        <h1 className="text-2xl font-bold text-white">Combine Listing Reviews</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">{reviews.length} shown</span>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(['open', 'resolved', 'all'] as const).map(s => (
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
      ) : reviews.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <ShoppingBag className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold mb-1">No {statusFilter === 'all' ? '' : statusFilter} listing reviews</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => {
            const l = r.marketplace_listings;
            return (
              <div key={r.id} className="card-premium p-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{l?.title ?? 'Listing deleted'}</p>
                    {l?.profiles && (
                      <Link to={`/profile/${l.profiles.username}`} className="text-xs text-sr-purple-light hover:text-white">
                        {fullName(l.profiles)} (@{l.profiles.username})
                      </Link>
                    )}
                  </div>
                  {l && <p className="text-sm font-bold text-sr-purple-light flex-shrink-0">${(l.price_cents / 100).toFixed(2)}</p>}
                </div>
                {l?.description && <p className="text-xs text-sr-silver mb-2">{l.description}</p>}
                {r.ai_reasoning && (
                  <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 mb-3">
                    AI flagged: {r.ai_reasoning}
                  </p>
                )}
                {r.status === 'resolved' ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${
                    r.resolution === 'approved' ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'
                  }`}>{r.resolution}</span>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => resolve(r, 'approved')} disabled={actioning === r.id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50">
                      {actioning === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                    </button>
                    <button onClick={() => resolve(r, 'rejected')} disabled={actioning === r.id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
