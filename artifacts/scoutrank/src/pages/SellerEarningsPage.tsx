import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { MarketplaceOrder } from '@/lib/supabase';
import { ArrowLeft, Loader2, DollarSign, Clock, TrendingUp, Calendar } from 'lucide-react';

// Paid orders sit in a holding window before becoming payout-eligible —
// standard practice giving a buffer for disputes/refunds before money
// actually moves. Purely a display/eligibility rule computed from
// created_at (payment typically completes within moments of order
// creation in this flow, so it's a close enough proxy for "paid at").
const HOLD_PERIOD_DAYS = 7;

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function nextFriday(): string {
  const d = new Date();
  const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function SellerEarningsPage() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase.from('marketplace_orders').select('*').eq('seller_id', profile.id).eq('status', 'paid')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setOrders((data as MarketplaceOrder[] | null) ?? []); setIsLoading(false); });
  }, [profile?.id]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>;

  const holdCutoff = Date.now() - HOLD_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const notYetPaidOut = orders.filter(o => !o.paid_out);
  const available = notYetPaidOut.filter(o => new Date(o.created_at).getTime() <= holdCutoff);
  const pending = notYetPaidOut.filter(o => new Date(o.created_at).getTime() > holdCutoff);
  const alreadyPaidOut = orders.filter(o => o.paid_out);

  const availableCents = available.reduce((sum, o) => sum + (o.seller_share_cents ?? 0), 0);
  const pendingCents = pending.reduce((sum, o) => sum + (o.seller_share_cents ?? 0), 0);
  const totalEarnedCents = orders.reduce((sum, o) => sum + (o.seller_share_cents ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/combine" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Combine
      </Link>
      <h1 className="text-2xl font-bold text-white mb-1">Earnings</h1>
      <p className="text-sm text-sr-text-muted mb-6">Payouts are sent manually each week — Stripe Connect for automatic payouts is planned once Combine has more volume.</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card-premium p-4">
          <div className="flex items-center gap-1.5 text-sr-text-muted mb-1"><DollarSign className="h-3.5 w-3.5" /><span className="text-[11px]">Available</span></div>
          <p className="text-lg font-bold text-white">{formatMoney(availableCents)}</p>
        </div>
        <div className="card-premium p-4">
          <div className="flex items-center gap-1.5 text-sr-text-muted mb-1"><Clock className="h-3.5 w-3.5" /><span className="text-[11px]">Pending</span></div>
          <p className="text-lg font-bold text-white">{formatMoney(pendingCents)}</p>
        </div>
        <div className="card-premium p-4">
          <div className="flex items-center gap-1.5 text-sr-text-muted mb-1"><TrendingUp className="h-3.5 w-3.5" /><span className="text-[11px]">Total Earned</span></div>
          <p className="text-lg font-bold text-white">{formatMoney(totalEarnedCents)}</p>
        </div>
      </div>

      {availableCents > 0 && (
        <div className="mb-6 p-3 rounded-lg bg-sr-purple/10 border border-sr-purple/30 flex items-center gap-2 text-sm text-white">
          <Calendar className="h-4 w-4 text-sr-purple-light flex-shrink-0" />
          Next payout: {nextFriday()}
        </div>
      )}

      <h2 className="text-sm font-semibold text-white mb-3">Sales History</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-sr-text-muted text-center py-8">No sales yet.</p>
      ) : (
        <div className="space-y-2">
          {orders.map(o => (
            <div key={o.id} className="card-premium p-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{o.listing_title_snapshot ?? 'Listing'}</p>
                <p className="text-xs text-sr-text-muted">{new Date(o.created_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{formatMoney(o.seller_share_cents ?? 0)}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                  o.paid_out ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                  new Date(o.created_at).getTime() <= holdCutoff ? 'text-sr-purple-light bg-sr-purple/10 border-sr-purple/20' :
                  'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
                }`}>
                  {o.paid_out ? 'Paid out' : new Date(o.created_at).getTime() <= holdCutoff ? 'Available' : 'Pending'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
