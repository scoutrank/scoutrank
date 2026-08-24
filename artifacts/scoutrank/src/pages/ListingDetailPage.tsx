import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import type { MarketplaceListing, Profile } from '@/lib/supabase';
import { publicUrlFor } from '@/lib/mediaStorage';
import { CheckoutForm } from '@/components/CheckoutForm';
import { DNA_ATTRIBUTES } from '@/lib/athleteDNA';
import { ArrowLeft, Loader2, ShoppingBag, Clock, Trash2 } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  speed_agility: 'Speed & Agility', strength: 'Strength', endurance: 'Endurance',
  mental_performance: 'Mental Performance', position_specific: 'Position-Specific',
  video_analysis: 'Video Analysis', coaching_session: '1-on-1 Coaching', assessment_package: 'Assessment Package',
};

// Must match the Edge Function's SURCHARGE_PERCENT — used here only to
// show the receipt breakdown before payment, not to compute the actual
// charge (the server always computes and charges the real amount).
const SURCHARGE_PERCENT = 5;

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [seller, setSeller] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutData, setCheckoutData] = useState<{ clientSecret: string; orderId: string } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setIsLoading(true);
      // Deliberately excludes file_url/file_path — this page is visible
      // to anyone who opens the listing, purchased or not, and this
      // component never renders a download link, so the digital file's
      // location has no reason to be in the response before someone has
      // actually paid (see OrderConfirmationPage/MyOrdersPage for the
      // post-purchase fetch, which is scoped to a paid order).
      const { data, error: err } = await supabase.from('marketplace_listings')
        .select('id, seller_id, title, description, category, dna_attribute, price_cents, currency, delivery_type, duration_weeks, status, removal_reason')
        .eq('id', id).maybeSingle();
      if (err || !data) { setError('Listing not found.'); setIsLoading(false); return; }
      setListing(data as MarketplaceListing);
      const { data: sellerData } = await supabase.from('profiles').select('*').eq('id', (data as MarketplaceListing).seller_id).maybeSingle();
      setSeller(sellerData as Profile | null);
      setIsLoading(false);
    })();

    // Live — the AI review (and fee-payment confirmation) both happen
    // asynchronously after this page has already loaded, so the status
    // shown here needs to update itself the moment either finishes,
    // rather than requiring a manual refresh to see the result.
    const channel = supabase
      .channel(`listing-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'marketplace_listings', filter: `id=eq.${id}` }, payload => {
        // Realtime broadcasts the full row regardless of the select()
        // used for the initial load — strip file_url/file_path here too
        // so a status-change event can't backfill them into state.
        const { file_url: _fileUrl, file_path: _filePath, ...rest } = payload.new as MarketplaceListing;
        setListing(rest as MarketplaceListing);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleBuyNow = async () => {
    if (!listing || !profile || listing.status !== 'active') return;
    setCheckingOut(true);
    setError('');
    const { data, error: err } = await supabase.functions.invoke('create-checkout-session', { body: { listingId: listing.id } });
    setCheckingOut(false);
    if (err) {
      let detail = err.message;
      const context = (err as { context?: Response }).context;
      if (context && typeof context.json === 'function') {
        try { const body = await context.clone().json(); if (body?.error) detail = body.error; } catch { /* fall back to generic message */ }
      }
      setError(detail);
      return;
    }
    if (data?.error) { setError(data.error); return; }
    if (data?.clientSecret && data?.orderId) setCheckoutData({ clientSecret: data.clientSecret, orderId: data.orderId });
  };

  const handleRemove = async () => {
    if (!listing || !profile || !removeReason.trim()) { setError('A reason is required.'); return; }
    setRemoving(true);
    setError('');
    const { error: err } = await supabase.from('marketplace_listings').update({
      status: 'removed',
      removal_reason: removeReason.trim(),
      removed_by: profile.id,
      removed_at: new Date().toISOString(),
    }).eq('id', listing.id);
    if (err) { setRemoving(false); setError(err.message); return; }

    await supabase.from('notifications').insert({
      recipient_id: listing.seller_id,
      actor_id: profile.id,
      type: 'listing_removed',
      target_type: 'marketplace_listing',
      target_id: listing.id,
    });

    setRemoving(false);
    setRemoveModalOpen(false);
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>;
  if (error && !listing) return <div className="max-w-lg mx-auto px-4 py-10 text-center text-sr-text-muted">{error}</div>;
  if (!listing) return null;

  const isOwnListing = profile?.id === listing.seller_id;
  const canRemove = (isOwnListing || isAdmin) && listing.status !== 'removed';
  const dnaLabel = listing.dna_attribute ? DNA_ATTRIBUTES.find(a => a.key === listing.dna_attribute)?.label : null;
  const surchargeCents = Math.round(listing.price_cents * SURCHARGE_PERCENT / 100);
  const totalCents = listing.price_cents + surchargeCents;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <Link to="/combine" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Combine
        </Link>
        <div className="flex items-center gap-2">
          {isOwnListing && listing.status !== 'removed' && (
            <Link to={`/combine/${listing.id}/edit`} className="text-xs px-2.5 py-1 rounded-lg text-sr-text-muted hover:bg-sr-surface-light hover:text-white">
              Edit
            </Link>
          )}
          {canRemove && (
            <button onClick={() => { setRemoveModalOpen(true); setRemoveReason(''); setError(''); }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg text-red-400 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sr-surface border border-sr-border text-sr-text-muted">{CATEGORY_LABELS[listing.category]}</span>
        {dnaLabel && <span className="text-[10px] px-2 py-0.5 rounded-full bg-sr-purple/10 border border-sr-purple/30 text-sr-purple-light">Targets {dnaLabel}</span>}
      </div>
      <h1 className="text-2xl font-bold text-white mb-1">{listing.title}</h1>
      <p className="text-2xl font-bold text-sr-purple-light mb-4">{formatPrice(listing.price_cents, listing.currency)}</p>

      {seller && (
        <Link to={`/profile/${seller.username}`} className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity">
          <div className="h-8 w-8 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple/50 to-sr-blue/50 flex items-center justify-center text-xs font-bold text-white">
            {seller.avatar_url ? <img src={seller.avatar_url} alt="" className="h-full w-full object-cover" /> : `${seller.first_name?.[0] ?? ''}${seller.last_name?.[0] ?? ''}`}
          </div>
          <div>
            <p className="text-sm text-white">{fullName(seller)}</p>
            <p className="text-xs text-sr-text-muted">@{seller.username}</p>
          </div>
        </Link>
      )}

      {listing.description && <p className="text-sm text-sr-silver mb-4 whitespace-pre-wrap">{listing.description}</p>}

      <div className="card-premium p-3 mb-6 text-xs text-sr-text-muted space-y-1">
        <p>Delivery: {listing.delivery_type === 'digital_download' ? 'Digital download' : 'Live session'}</p>
        {listing.duration_weeks && <p>Duration: {listing.duration_weeks} weeks</p>}
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      {listing.status === 'pending_payment' && isOwnListing && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
          The listing fee hasn't been paid yet, so this hasn't been submitted for review. <Link to="/combine/new" className="underline">Start a new listing</Link> to try again.
        </div>
      )}
      {listing.status === 'pending_review' && isOwnListing && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 flex-shrink-0" /> Under review — this isn't visible in Combine yet. Usually just a few seconds, occasionally needs a human look.
        </div>
      )}
      {listing.status === 'rejected' && isOwnListing && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          This listing wasn't approved and isn't visible to buyers. <Link to={`/combine/${listing.id}/edit`} className="underline">Edit it</Link> and it'll be reviewed again.
        </div>
      )}
      {listing.status === 'removed' && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          This listing was removed{listing.removal_reason ? `: ${listing.removal_reason}` : '.'}
        </div>
      )}

      {isOwnListing ? (
        <p className="text-sm text-sr-text-muted text-center">This is your own listing.</p>
      ) : listing.status !== 'active' ? (
        <p className="text-sm text-sr-text-muted text-center">This listing isn't available right now.</p>
      ) : checkoutData ? (
        <div className="card-premium p-4">
          <p className="text-sm font-semibold text-white mb-3">Complete Payment</p>
          <CheckoutForm
            clientSecret={checkoutData.clientSecret}
            returnUrl={`${window.location.origin}/combine/order/${checkoutData.orderId}?success=true`}
            onSuccess={() => navigate(`/combine/order/${checkoutData.orderId}?success=true`)}
          />
        </div>
      ) : showReceipt ? (
        <div className="card-premium p-4">
          <p className="text-sm font-semibold text-white mb-3">Order Summary</p>
          <div className="space-y-1.5 text-sm mb-4">
            <div className="flex justify-between text-sr-silver">
              <span>{listing.title}</span>
              <span>{formatPrice(listing.price_cents, listing.currency)}</span>
            </div>
            <div className="flex justify-between text-sr-text-muted text-xs">
              <span>ScoutRank Surcharge ({SURCHARGE_PERCENT}%)</span>
              <span>{formatPrice(surchargeCents, listing.currency)}</span>
            </div>
            <div className="flex justify-between text-white font-semibold pt-1.5 border-t border-sr-border">
              <span>Total</span>
              <span>{formatPrice(totalCents, listing.currency)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowReceipt(false)} className="flex-1 text-xs px-3 py-2.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
              Back
            </button>
            <button onClick={handleBuyNow} disabled={checkingOut}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
              {checkingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Next
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowReceipt(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
          <ShoppingBag className="h-4 w-4" /> Buy Now — {formatPrice(listing.price_cents, listing.currency)}
        </button>
      )}
      <p className="text-[11px] text-sr-text-muted text-center mt-2">
        Secure checkout powered by Stripe.
      </p>

      {removeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRemoveModalOpen(false)}>
          <div className="w-full max-w-sm card-premium p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Remove Listing</h3>
            <p className="text-xs text-sr-text-muted mb-4">
              {isOwnListing ? "This takes it off Combine." : "The seller"} will be shown this reason.
            </p>
            {error && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>}
            <label className="block text-xs text-sr-text-muted mb-1">Reason</label>
            <textarea value={removeReason} onChange={e => setRemoveReason(e.target.value)} rows={3}
              className="input-dark w-full resize-none text-sm mb-3" placeholder="Why is this being removed?" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRemoveModalOpen(false)} className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                Cancel
              </button>
              <button onClick={handleRemove} disabled={removing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove Listing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
