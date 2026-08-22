import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { MarketplaceListing } from '@/lib/supabase';
import { DNA_ATTRIBUTES } from '@/lib/athleteDNA';
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

/**
 * Editing is limited to content, not price — once the listing fee is
 * paid it's calculated off the original price, so letting price change
 * afterward would create a mismatch between what was paid and what's
 * being charged. Any edit sends it back through AI review, since the
 * content actually changed and needs re-checking.
 */
export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('speed_agility');
  const [dnaAttribute, setDnaAttribute] = useState('');
  const [durationWeeks, setDurationWeeks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    supabase.from('marketplace_listings').select('*').eq('id', id).maybeSingle().then(({ data, error: err }) => {
      if (err || !data) { setError('Listing not found.'); setIsLoading(false); return; }
      const l = data as MarketplaceListing;
      if (l.seller_id !== profile?.id) { setError("This listing doesn't belong to you."); setIsLoading(false); return; }
      setListing(l);
      setTitle(l.title);
      setDescription(l.description ?? '');
      setCategory(l.category);
      setDnaAttribute(l.dna_attribute ?? '');
      setDurationWeeks(l.duration_weeks?.toString() ?? '');
      setIsLoading(false);
    });
  }, [id, profile?.id]);

  const handleSubmit = async () => {
    if (!listing || !title.trim()) { setError('Title is required.'); return; }
    setSubmitting(true);
    setError('');

    const goingBackToReview = listing.status === 'active' || listing.status === 'rejected' || listing.status === 'pending_review';
    const { error: err } = await supabase.from('marketplace_listings').update({
      title: title.trim(),
      description: description.trim() || null,
      category,
      dna_attribute: dnaAttribute || null,
      duration_weeks: durationWeeks ? parseInt(durationWeeks) : null,
      status: goingBackToReview ? 'pending_review' : listing.status,
    }).eq('id', listing.id);
    if (err) { setSubmitting(false); setError(err.message); return; }

    if (goingBackToReview) {
      await supabase.functions.invoke('review-marketplace-listing', { body: { listingId: listing.id } });
    }
    setSubmitting(false);
    navigate(`/combine/${listing.id}`);
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>;
  if (error && !listing) return <div className="max-w-lg mx-auto px-4 py-10 text-center text-sr-text-muted">{error}</div>;
  if (!listing) return null;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link to={`/combine/${listing.id}`} className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Listing
      </Link>
      <h1 className="text-xl font-bold text-white mb-1">Edit Listing</h1>
      <p className="text-sm text-sr-text-muted mb-6">
        Price can't be changed after the listing fee is paid. Any edit sends this back for AI review before it's visible again.
      </p>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Title</label>
          <input className="input-dark" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Description</label>
          <textarea className="input-dark h-24 resize-none" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Category</label>
          <Select value={category} onChange={setCategory} options={CATEGORIES.map(([value, label]) => ({ value, label }))} />
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Targets which Athlete DNA attribute?</label>
          <Select value={dnaAttribute} onChange={setDnaAttribute} placeholder="None specifically"
            options={DNA_ATTRIBUTES.map(a => ({ value: a.key, label: a.label }))} />
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Duration (weeks, optional)</label>
          <input className="input-dark" type="number" min="0" value={durationWeeks} onChange={e => setDurationWeeks(e.target.value)} />
        </div>
        <div className="p-3 rounded-lg bg-sr-surface border border-sr-border text-xs text-sr-text-muted">
          Price: <span className="text-white font-semibold">{new Intl.NumberFormat(undefined, { style: 'currency', currency: listing.currency.toUpperCase() }).format(listing.price_cents / 100)}</span> (locked)
        </div>
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Changes
        </button>
      </div>
    </div>
  );
}
