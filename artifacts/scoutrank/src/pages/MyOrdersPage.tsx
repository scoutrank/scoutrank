import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import type { MarketplaceOrder, MarketplaceListing, Profile } from '@/lib/supabase';
import { publicUrlFor } from '@/lib/mediaStorage';
import { ArrowLeft, Loader2, ShoppingBag, Download, ExternalLink } from 'lucide-react';

interface OrderWithListing extends MarketplaceOrder {
  listing: (Pick<MarketplaceListing, 'file_url' | 'file_path' | 'delivery_type'> & { seller: Profile | null }) | null;
}

function formatMoney(cents: number, currency = 'usd') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

export default function MyOrdersPage() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<OrderWithListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from('marketplace_orders').select('*').eq('buyer_id', profile.id)
        .in('status', ['paid', 'delivered']).order('created_at', { ascending: false });
      const rows = (data as MarketplaceOrder[] | null) ?? [];

      const withListings: OrderWithListing[] = await Promise.all(rows.map(async o => {
        if (!o.listing_id) return { ...o, listing: null };
        const { data: l } = await supabase.from('marketplace_listings').select('file_url, file_path, delivery_type, seller_id').eq('id', o.listing_id).maybeSingle();
        if (!l) return { ...o, listing: null };
        const { data: seller } = await supabase.from('profiles').select('*').eq('id', l.seller_id).maybeSingle();
        return { ...o, listing: { file_url: l.file_url, file_path: l.file_path, delivery_type: l.delivery_type, seller: seller as Profile | null } };
      }));
      setOrders(withListings);
      setIsLoading(false);
    })();
  }, [profile?.id]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/combine" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Combine
      </Link>
      <h1 className="text-2xl font-bold text-white mb-6">My Purchases</h1>

      {orders.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <ShoppingBag className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold mb-1">No purchases yet</p>
          <Link to="/combine" className="text-sm text-sr-purple-light hover:text-white">Browse Combine →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const downloadUrl = o.listing?.file_path ? publicUrlFor('marketplace-files', o.listing.file_path) : o.listing?.file_url;
            return (
              <div key={o.id} className="card-premium p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-white">{o.listing_title_snapshot}</p>
                  <p className="text-sm font-bold text-sr-purple-light">{formatMoney(o.amount_cents, 'usd')}</p>
                </div>
                <p className="text-xs text-sr-text-muted mb-3">{new Date(o.created_at).toLocaleDateString()}</p>
                {o.listing?.delivery_type === 'digital_download' && downloadUrl && (
                  <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                )}
                {o.listing?.delivery_type === 'live_session' && o.listing.seller && (
                  <Link to={`/profile/${o.listing.seller.username}`}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30">
                    Contact {fullName(o.listing.seller)} <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
