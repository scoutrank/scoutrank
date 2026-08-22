import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { uploadResumable } from '@/lib/mediaStorage';
import { DNA_ATTRIBUTES } from '@/lib/athleteDNA';
import { CheckoutForm } from '@/components/CheckoutForm';
import { Select } from '@/components/ui/Select';
import { ArrowLeft, Loader2 } from 'lucide-react';

const CATEGORIES = [
  ['speed_agility', 'Speed & Agility'],
  ['strength', 'Strength'],
  ['endurance', 'Endurance'],
  ['mental_performance', 'Mental Performance'],
  ['position_specific', 'Position-Specific'],
  ['video_analysis', 'Video Analysis'],
  ['coaching_session', '1-on-1 Coaching'],
  ['assessment_package', 'Assessment Package'],
];

// 15% of the seller's own asking price — must match the Edge Function's
// LISTING_FEE_PERCENT, used here only to show the amount before payment.
const LISTING_FEE_PERCENT = 15;
// Must match create-checkout-session's SURCHARGE_PERCENT — shown here
// only in the explanatory copy, not used for any actual calculation.
const SURCHARGE_PERCENT = 5;

export default function CreateListingPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  if (profile && profile.seller_status !== 'approved') {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <h1 className="text-xl font-bold text-white mb-2">Seller Approval Required</h1>
        <p className="text-sm text-sr-text-muted mb-4">
          {profile.seller_status === 'pending' ? "Your seller application is still being reviewed." : "You'll need to apply and be approved before you can list something for sale."}
        </p>
        <Link to="/combine/become-a-seller" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
          {profile.seller_status === 'pending' ? 'Check Application Status' : 'Apply to Sell'}
        </Link>
      </div>
    );
  }

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('speed_agility');
  const [dnaAttribute, setDnaAttribute] = useState('');
  const [price, setPrice] = useState('');
  const [deliveryType, setDeliveryType] = useState<'digital_download' | 'live_session'>('digital_download');
  const [fileSource, setFileSource] = useState<'link' | 'upload'>('upload');
  const [fileUrl, setFileUrl] = useState('');
  const [uploadedPath, setUploadedPath] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [durationWeeks, setDurationWeeks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdListingId, setCreatedListingId] = useState('');
  const [feeCheckout, setFeeCheckout] = useState<{ clientSecret: string; feeCents: number } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setIsUploading(true);
    setUploadPercent(0);
    setError('');
    const path = `${profile.id}/${Date.now()}-${file.name}`;
    try {
      await uploadResumable('marketplace-files', path, file, {
        onProgress: p => setUploadPercent(Math.round((p.bytesUploaded / p.bytesTotal) * 100)),
      });
      setUploadedPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!profile || !title.trim() || !price) { setError('Title and price are required.'); return; }
    const priceCents = Math.round(parseFloat(price) * 100);
    if (isNaN(priceCents) || priceCents < 0) { setError('Enter a valid price.'); return; }
    if (deliveryType === 'digital_download' && fileSource === 'upload' && !uploadedPath) {
      setError('Please upload a file, or switch to linking one instead.');
      return;
    }
    setSubmitting(true);
    setError('');
    const { data, error: err } = await supabase.from('marketplace_listings').insert({
      seller_id: profile.id,
      title: title.trim(),
      description: description.trim() || null,
      category,
      dna_attribute: dnaAttribute || null,
      price_cents: priceCents,
      delivery_type: deliveryType,
      file_url: deliveryType === 'digital_download' && fileSource === 'link' ? (fileUrl.trim() || null) : null,
      file_path: deliveryType === 'digital_download' && fileSource === 'upload' ? (uploadedPath || null) : null,
      duration_weeks: durationWeeks ? parseInt(durationWeeks) : null,
    }).select('id').single();
    if (err) { setSubmitting(false); setError(err.message); return; }

    const listingId = (data as { id: string }).id;
    setCreatedListingId(listingId);

    const { data: feeData, error: feeErr } = await supabase.functions.invoke('create-listing-fee-payment', { body: { listingId } });
    setSubmitting(false);
    if (feeErr || feeData?.error) {
      setError(feeData?.error ?? feeErr?.message ?? 'Failed to set up the listing fee payment.');
      return;
    }
    setFeeCheckout({ clientSecret: feeData.clientSecret, feeCents: feeData.feeCents });
  };

  const handleFeePaid = async () => {
    // The webhook is the only trustworthy confirmation, and it can lag a
    // moment behind the client-side payment confirmation — poll briefly
    // rather than navigating immediately and showing a stale "not paid"
    // state if the webhook hasn't caught up yet.
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data } = await supabase.from('marketplace_listings').select('fee_paid').eq('id', createdListingId).maybeSingle();
      if (data?.fee_paid) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    // Deliberately not awaited — the AI review can take a few seconds,
    // and there's no reason to block navigation on it. The listing page
    // already shows a live "under review" state and updates itself
    // automatically the moment this finishes.
    supabase.functions.invoke('review-marketplace-listing', { body: { listingId: createdListingId } })
      .then(({ error }) => { if (error) console.error('[review] Listing review call failed:', error.message); });
    navigate(`/combine/${createdListingId}`);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link to="/combine" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Combine
      </Link>
      <h1 className="text-xl font-bold text-white mb-1">{feeCheckout ? 'Pay Listing Fee' : 'List Something for Sale'}</h1>

      {feeCheckout ? (
        <>
          <p className="text-sm text-sr-text-muted mb-6">
            A {LISTING_FEE_PERCENT}% listing fee (${(feeCheckout.feeCents / 100).toFixed(2)}) is charged upfront to post — your listing goes to review right after this is paid.
          </p>
          <div className="card-premium p-4">
            <CheckoutForm
              clientSecret={feeCheckout.clientSecret}
              returnUrl={`${window.location.origin}/combine/${createdListingId}`}
              onSuccess={handleFeePaid}
              buttonLabel={`Pay $${(feeCheckout.feeCents / 100).toFixed(2)} & Submit`}
            />
          </div>
        </>
      ) : (
        <>
      <p className="text-sm text-sr-text-muted mb-6">
        Digital only for now — training programs, coaching sessions, video analysis, assessments. Posting costs a {LISTING_FEE_PERCENT}% fee of your listed price, charged upfront. Every listing is then reviewed (AI first, a human if anything's unclear) before it goes live — usually just a few seconds. When it sells, you receive your full listed price — buyers pay a separate {SURCHARGE_PERCENT}% surcharge on top of that, which goes to ScoutRank.
      </p>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Title</label>
          <input className="input-dark" value={title} onChange={e => setTitle(e.target.value)} placeholder="8-Week Acceleration Program" />
        </div>

        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Description</label>
          <textarea className="input-dark h-24 resize-none" value={description} onChange={e => setDescription(e.target.value)} placeholder="What's included, who it's for, expected results..." />
        </div>

        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Category</label>
          <Select value={category} onChange={setCategory} options={CATEGORIES.map(([value, label]) => ({ value, label }))} />
        </div>

        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Targets which Athlete DNA attribute? <span className="text-sr-text-muted font-normal">(optional — enables it showing as a personalized recommendation)</span></label>
          <Select value={dnaAttribute} onChange={setDnaAttribute} placeholder="None specifically"
            options={DNA_ATTRIBUTES.map(a => ({ value: a.key, label: a.label }))} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Price (USD)</label>
            <input className="input-dark" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="19.95" />
          </div>
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Duration (weeks, optional)</label>
            <input className="input-dark" type="number" min="0" value={durationWeeks} onChange={e => setDurationWeeks(e.target.value)} placeholder="8" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Delivery</label>
          <div className="flex gap-2">
            <button onClick={() => setDeliveryType('digital_download')}
              className={`flex-1 text-sm px-3 py-2 rounded-lg border transition-colors ${deliveryType === 'digital_download' ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted'}`}>
              Digital Download
            </button>
            <button onClick={() => setDeliveryType('live_session')}
              className={`flex-1 text-sm px-3 py-2 rounded-lg border transition-colors ${deliveryType === 'live_session' ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted'}`}>
              Live Session
            </button>
          </div>
        </div>

        {deliveryType === 'digital_download' && (
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">File</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setFileSource('upload')}
                className={`flex-1 text-xs px-3 py-1.5 rounded-lg border transition-colors ${fileSource === 'upload' ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted'}`}>
                Upload a file
              </button>
              <button onClick={() => setFileSource('link')}
                className={`flex-1 text-xs px-3 py-1.5 rounded-lg border transition-colors ${fileSource === 'link' ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted'}`}>
                Link to a file
              </button>
            </div>
            {fileSource === 'upload' ? (
              <>
                <input type="file" onChange={handleFileChange} disabled={isUploading}
                  className="block w-full text-xs text-sr-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sr-surface-light file:text-sr-silver" />
                {isUploading && (
                  <div className="mt-2">
                    <p className="text-xs text-sr-text-muted mb-1">Uploading... {uploadPercent}%</p>
                    <div className="h-1.5 w-full rounded-full bg-sr-border overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-sr-purple to-sr-blue transition-all duration-200" style={{ width: `${uploadPercent}%` }} />
                    </div>
                  </div>
                )}
                {uploadedPath && !isUploading && <p className="text-xs text-green-400 mt-2">File uploaded</p>}
              </>
            ) : (
              <input className="input-dark" value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://drive.google.com/..." />
            )}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting || isUploading}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue to Payment
        </button>
      </div>
      </>
      )}
    </div>
  );
}
