import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { MarketplaceListing } from '@/lib/supabase';
import { computeDNAScores, DNA_ATTRIBUTES } from '@/lib/athleteDNA';
import { ShoppingBag, Plus, Loader2, TrendingDown } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  speed_agility: 'Speed & Agility',
  strength: 'Strength',
  endurance: 'Endurance',
  mental_performance: 'Mental Performance',
  position_specific: 'Position-Specific',
  video_analysis: 'Video Analysis',
  coaching_session: '1-on-1 Coaching',
  assessment_package: 'Assessment Packages',
};

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

export default function MarketplacePage() {
  const { profile } = useAuth();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [weakestAttribute, setWeakestAttribute] = useState<{ key: string; label: string; score: number } | null>(null);

  useEffect(() => {
    supabase.from('marketplace_listings').select('*').eq('status', 'active').order('created_at', { ascending: false })
      .then(({ data }) => { setListings((data as MarketplaceListing[] | null) ?? []); setIsLoading(false); });

    // Find the athlete's single weakest DNA attribute with real data, to
    // surface one genuinely relevant recommendation rather than a generic
    // storefront banner — this is the actual point of tying Marketplace
    // to Athlete DNA instead of it being a bolt-on shop.
    if (profile?.role === 'athlete') {
      computeDNAScores(profile.id, profile.dna_self_reported).then(scores => {
        const withData = scores.filter(s => s.score !== null);
        if (withData.length === 0) return;
        const weakest = withData.reduce((a, b) => (b.score! < a.score! ? b : a));
        const label = DNA_ATTRIBUTES.find(a => a.key === weakest.attribute)?.label ?? weakest.attribute;
        setWeakestAttribute({ key: weakest.attribute, label, score: weakest.score! });
      });
    }
  }, [profile?.id]);

  const filtered = listings.filter(l => categoryFilter === 'all' || l.category === categoryFilter);
  const recommended = weakestAttribute ? listings.filter(l => l.dna_attribute === weakestAttribute.key) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-sr-purple-light" />
          <h1 className="text-2xl font-bold text-white">Combine</h1>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {profile && (
            <Link to="/combine/my-orders" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30">
              My Purchases
            </Link>
          )}
          {profile?.seller_status === 'approved' && (
            <>
              <Link to={`/profile/${profile.username}?tab=listings`} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30">
                My Listings
              </Link>
              <Link to="/combine/earnings" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30">
                Earnings
              </Link>
            </>
          )}
          <Link to="/combine/new" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90">
            <Plus className="h-3.5 w-3.5" /> Sell Something
          </Link>
        </div>
      </div>
      <p className="text-sm text-sr-text-muted mb-6">Training programs, coaching, and assessments from athletes and coaches on ScoutRank.</p>

      {recommended.length > 0 && weakestAttribute && (
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-sr-purple/15 to-sr-blue/15 border border-sr-purple/30">
          <p className="text-sm font-semibold text-white flex items-center gap-1.5 mb-1">
            <TrendingDown className="h-4 w-4 text-sr-purple-light" /> Recommended for you
          </p>
          <p className="text-xs text-sr-text-muted mb-3">
            Your {weakestAttribute.label} score ({weakestAttribute.score}/100) is your lowest Athlete DNA attribute with data — these programs target it directly.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {recommended.slice(0, 2).map(l => (
              <Link key={l.id} to={`/combine/${l.id}`} className="card-premium p-3 hover:border-sr-purple/30 transition-colors">
                <p className="text-sm font-semibold text-white">{l.title}</p>
                <p className="text-xs text-sr-purple-light mt-1">{formatPrice(l.price_cents, l.currency)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6 overflow-x-auto">
        <button onClick={() => setCategoryFilter('all')}
          className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-colors ${categoryFilter === 'all' ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'}`}>
          All
        </button>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <button key={value} onClick={() => setCategoryFilter(value)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-colors ${categoryFilter === value ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'}`}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <ShoppingBag className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold mb-1">Nothing here yet</p>
          <p className="text-sm text-sr-text-muted">Be the first to list something in this category.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(l => (
            <Link key={l.id} to={`/combine/${l.id}`} className="card-premium p-4 hover:border-sr-purple/30 transition-colors">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sr-surface border border-sr-border text-sr-text-muted">{CATEGORY_LABELS[l.category]}</span>
              <p className="text-sm font-semibold text-white mt-2">{l.title}</p>
              {l.description && <p className="text-xs text-sr-text-muted mt-1 line-clamp-2">{l.description}</p>}
              <p className="text-base font-bold text-sr-purple-light mt-2">{formatPrice(l.price_cents, l.currency)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
