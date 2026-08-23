import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import type { MarketplaceOrder, Profile } from '@/lib/supabase';
import { Loader2, DollarSign, Check } from 'lucide-react';
import { AdminTopNav } from '@/components/layout/AdminTopNav';

const HOLD_PERIOD_DAYS = 7;

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

interface SellerBucket {
  seller: Profile;
  orders: MarketplaceOrder[];
  totalCents: number;
}

/**
 * Manual payout tool for Phase 1 — no Stripe Connect yet, so an admin
 * marks orders as paid out once they've actually sent the money
 * (bank transfer, PayPal, whatever's being used for now). Only shows
 * orders past the holding window, same eligibility rule as what
 * sellers see on their own earnings page.
 */
export default function AdminPayoutsPage() {
  const { isAdmin } = useAuth();
  const [buckets, setBuckets] = useState<SellerBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError('');
    const holdCutoff = new Date(Date.now() - HOLD_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: err } = await supabase
      .from('marketplace_orders')
      .select('*, profiles:seller_id(*)')
      .eq('status', 'paid')
      .eq('paid_out', false)
      .lte('created_at', holdCutoff)
      .order('created_at', { ascending: true });
    if (err) { setError(err.message); setIsLoading(false); return; }

    const bySeller = new Map<string, SellerBucket>();
    for (const row of (data as unknown as (MarketplaceOrder & { profiles: Profile })[]) ?? []) {
      const existing = bySeller.get(row.seller_id);
      if (existing) {
        existing.orders.push(row);
        existing.totalCents += row.seller_share_cents ?? 0;
      } else {
        bySeller.set(row.seller_id, { seller: row.profiles, orders: [row], totalCents: row.seller_share_cents ?? 0 });
      }
    }
    setBuckets(Array.from(bySeller.values()).sort((a, b) => b.totalCents - a.totalCents));
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markPaidOut = async (bucket: SellerBucket) => {
    setPaying(bucket.seller.id);
    setError('');
    const { error: err } = await supabase.from('marketplace_orders')
      .update({ paid_out: true, paid_out_at: new Date().toISOString() })
      .in('id', bucket.orders.map(o => o.id));
    setPaying(null);
    if (err) { setError(err.message); return; }
    setBuckets(prev => prev.filter(b => b.seller.id !== bucket.seller.id));
  };

  if (!isAdmin) return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;

  return (
    <div className="min-h-screen bg-sr-bg">
      <AdminTopNav />
      <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <DollarSign className="h-7 w-7 text-sr-purple-light" />
        <h1 className="text-2xl font-bold text-white">Combine Payouts</h1>
      </div>
      <p className="text-sm text-sr-text-muted mb-6">
        Sellers with an available balance, past the {HOLD_PERIOD_DAYS}-day holding window. Mark a seller as paid once you've actually sent the money.
      </p>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : buckets.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold">Nothing owed right now</p>
        </div>
      ) : (
        <div className="space-y-3">
          {buckets.map(b => (
            <div key={b.seller.id} className="card-premium p-4">
              <div className="flex items-center justify-between mb-2">
                <Link to={`/profile/${b.seller.username}`} className="text-sm font-semibold text-white hover:text-sr-purple-light">
                  {fullName(b.seller)} <span className="text-sr-text-muted font-normal">@{b.seller.username}</span>
                </Link>
                <p className="text-lg font-bold text-sr-purple-light">{formatMoney(b.totalCents)}</p>
              </div>
              <p className="text-xs text-sr-text-muted mb-3">{b.orders.length} order{b.orders.length !== 1 ? 's' : ''} ready for payout</p>
              <button onClick={() => markPaidOut(b)} disabled={paying === b.seller.id}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50">
                {paying === b.seller.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Mark Paid Out
              </button>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
