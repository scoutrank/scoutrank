import { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase, fullName } from '@/lib/supabase';
import type { MarketplaceOrder, Profile } from '@/lib/supabase';
import { publicUrlFor } from '@/lib/mediaStorage';
import { ArrowLeft, Loader2, CheckCircle2, Download, ExternalLink, Clock } from 'lucide-react';

/**
 * Where Stripe Checkout sends the buyer after payment. Doesn't trust the
 * redirect itself as proof of payment — that's what the webhook is for —
 * this just polls briefly for the webhook to have caught up, since it's
 * usually near-instant but not guaranteed to beat the redirect.
 */
export default function OrderConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<MarketplaceOrder | null>(null);
  const [listing, setListing] = useState<{ file_url: string | null; file_path: string | null; delivery_type: string; title: string } | null>(null);
  const [seller, setSeller] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let attempts = 0;
    const poll = async () => {
      const { data, error: err } = await supabase.from('marketplace_orders').select('*').eq('id', id).maybeSingle();
      if (err || !data) { setError('Order not found.'); setIsLoading(false); return; }
      const o = data as MarketplaceOrder;
      setOrder(o);

      if (o.status === 'pending_contact' || o.status === 'awaiting_payment') {
        if (searchParams.get('success') === 'true' && attempts < 6) {
          attempts++;
          setTimeout(poll, 1500);
          return;
        }
      }

      if (o.listing_id) {
        const { data: l } = await supabase.from('marketplace_listings').select('file_url, file_path, delivery_type, title').eq('id', o.listing_id).maybeSingle();
        setListing(l as typeof listing);
      }
      const { data: s } = await supabase.from('profiles').select('*').eq('id', o.seller_id).maybeSingle();
      setSeller(s as Profile | null);
      setIsLoading(false);
    };
    poll();
  }, [id]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>;
  if (error || !order) return <div className="max-w-lg mx-auto px-4 py-10 text-center text-sr-text-muted">{error || 'Not found.'}</div>;

  const isPaid = order.status === 'paid' || order.status === 'delivered';
  const downloadUrl = listing?.file_path ? publicUrlFor('marketplace-files', listing.file_path) : listing?.file_url;

  return (
    <div className="max-w-lg mx-auto px-4 py-10 text-center">
      <Link to="/combine" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Combine
      </Link>

      {isPaid ? (
        <>
          <CheckCircle2 className="h-14 w-14 text-green-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-1">Payment Successful</h1>
          <p className="text-sm text-sr-text-muted mb-6">{order.listing_title_snapshot}</p>

          {listing?.delivery_type === 'digital_download' && downloadUrl && (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 mb-4">
              <Download className="h-4 w-4" /> Download
            </a>
          )}
          {listing?.delivery_type === 'live_session' && seller && (
            <div className="card-premium p-4 mt-4 text-left">
              <p className="text-sm text-white mb-1">This is a live session — reach out to arrange a time:</p>
              <Link to={`/profile/${seller.username}`} className="text-sm text-sr-purple-light hover:text-white flex items-center gap-1">
                {fullName(seller)} (@{seller.username}) <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </>
      ) : (
        <>
          <Clock className="h-14 w-14 text-yellow-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-1">Confirming Payment...</h1>
          <p className="text-sm text-sr-text-muted">This usually only takes a moment. Refresh this page if it doesn't update shortly.</p>
        </>
      )}
    </div>
  );
}
