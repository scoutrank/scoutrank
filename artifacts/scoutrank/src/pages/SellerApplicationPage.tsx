import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';

/**
 * Selling on Combine requires approval — given minors use this
 * platform and some listing types (coaching sessions) involve direct
 * contact, this is a real gate, not a formality.
 */
export default function SellerApplicationPage() {
  const { profile, refreshProfile } = useAuth();
  const [fullLegalName, setFullLegalName] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!profile || !fullLegalName.trim() || !reason.trim()) { setError('Please fill in both fields.'); return; }
    setSubmitting(true);
    setError('');
    const { error: err } = await supabase.from('seller_applications').insert({
      profile_id: profile.id,
      full_legal_name: fullLegalName.trim(),
      reason: reason.trim(),
    });
    if (err) { setSubmitting(false); setError(err.message); return; }
    await supabase.from('profiles').update({ seller_status: 'pending', seller_applied_at: new Date().toISOString() }).eq('id', profile.id);
    await refreshProfile();
    setSubmitting(false);
    setSubmitted(true);
  };

  if (profile?.seller_status === 'pending') {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <ShieldCheck className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Application Pending</h1>
        <p className="text-sm text-sr-text-muted">Your seller application is being reviewed. We'll let you know once it's decided.</p>
      </div>
    );
  }
  if (profile?.seller_status === 'approved') {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <ShieldCheck className="h-12 w-12 text-green-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">You're an Approved Seller</h1>
        <Link to="/combine/new" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 mt-2">
          Create a Listing
        </Link>
      </div>
    );
  }
  if (submitted) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <ShieldCheck className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Application Submitted</h1>
        <p className="text-sm text-sr-text-muted">We'll review it and let you know. This usually doesn't take long.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <Link to="/combine" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Combine
      </Link>
      <h1 className="text-xl font-bold text-white mb-1">Become a Seller</h1>
      <p className="text-sm text-sr-text-muted mb-6">
        Selling on ScoutRank requires approval first. This helps keep Combine trustworthy — especially since younger athletes use this platform.
      </p>

      {profile?.seller_status === 'rejected' && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          Your previous application wasn't approved. You're welcome to apply again below.
        </div>
      )}
      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Full legal name</label>
          <input className="input-dark" value={fullLegalName} onChange={e => setFullLegalName(e.target.value)} placeholder="Jane Smith" />
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">What do you want to sell, and what's your relevant experience/qualification?</label>
          <textarea className="input-dark h-28 resize-none" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Certified strength coach, 8 years experience, want to sell structured training programs..." />
        </div>
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit Application
        </button>
      </div>
    </div>
  );
}
