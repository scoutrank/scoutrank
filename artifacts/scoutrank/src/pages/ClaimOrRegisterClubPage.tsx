import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Organisation } from '@/lib/supabase';
import { COUNTRIES, getStatesForCountry, ORG_TYPE_LABEL } from '@/lib/locations';
import { SPORT_OPTIONS } from '@/lib/sports';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ArrowLeft, Search, Building2, Shield, Loader2, Check } from 'lucide-react';

export default function ClaimOrRegisterClubPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'choose' | 'claim' | 'register'>('choose');

  // Claim flow
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Organisation[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organisation | null>(null);

  // Shared applicant fields
  const [officialEmail, setOfficialEmail] = useState('');
  const [applicantName, setApplicantName] = useState(profile ? `${profile.first_name} ${profile.last_name}` : '');
  const [applicantPosition, setApplicantPosition] = useState('');
  const [proofDetails, setProofDetails] = useState('');

  // Register-only fields
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('club');
  const [orgSports, setOrgSports] = useState<string[]>([]);
  const [country, setCountry] = useState('Australia');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'claim' || !search.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      supabase.from('organisations').select('*').ilike('name', `%${search.trim()}%`).eq('is_active', true).limit(10)
        .then(({ data }) => { setSearchResults((data as Organisation[] | null) ?? []); setSearching(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [search, mode]);

  const submit = async () => {
    if (!profile) return;
    if (!officialEmail.trim() || !applicantName.trim() || !applicantPosition.trim()) {
      setError('Email, your name, and your position are all required.');
      return;
    }
    if (mode === 'claim' && !selectedOrg) { setError('Select a club to claim first.'); return; }
    if (mode === 'register' && !orgName.trim()) { setError('Club name is required.'); return; }

    setSubmitting(true);
    setError('');
    const { error: err } = await supabase.from('organisation_claims').insert({
      claimant_id: profile.id,
      claim_type: mode,
      organisation_id: mode === 'claim' ? selectedOrg!.id : null,
      new_org_name: mode === 'register' ? orgName.trim() : null,
      new_org_type: mode === 'register' ? orgType : null,
      new_org_sports: mode === 'register' ? orgSports : null,
      new_org_country: mode === 'register' ? country : null,
      new_org_state: mode === 'register' ? state : null,
      new_org_city: mode === 'register' ? city.trim() : null,
      new_org_website: mode === 'register' ? website.trim() || null : null,
      official_email: officialEmail.trim(),
      applicant_name: applicantName.trim(),
      applicant_position: applicantPosition.trim(),
      proof_details: proofDetails.trim() || null,
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <Check className="h-7 w-7 text-green-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Application submitted</h1>
        <p className="text-sm text-sr-text-muted mb-6">
          An admin will review your {mode === 'claim' ? 'claim' : 'registration'} and verify you're authorised to represent this club. You'll be notified once it's reviewed.
        </p>
        <Link to="/discover" className="text-sm text-sr-purple-light hover:text-white">← Back to Discover</Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link to="/discover" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Discover
      </Link>

      {mode === 'choose' && (
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Get Your Club on ScoutRank</h1>
          <p className="text-sm text-sr-text-muted mb-6">Either claim a club that's already listed, or register a brand new one.</p>
          <div className="space-y-3">
            <button onClick={() => setMode('claim')} className="w-full card-premium p-5 text-left hover:border-sr-purple/30 transition-colors">
              <div className="flex items-center gap-3 mb-1.5">
                <Search className="h-5 w-5 text-sr-purple-light" />
                <p className="text-white font-semibold">Claim Your Club</p>
              </div>
              <p className="text-xs text-sr-text-muted">Your club is already listed on ScoutRank, but nobody's verified as its representative yet.</p>
            </button>
            <button onClick={() => setMode('register')} className="w-full card-premium p-5 text-left hover:border-sr-purple/30 transition-colors">
              <div className="flex items-center gap-3 mb-1.5">
                <Building2 className="h-5 w-5 text-sr-purple-light" />
                <p className="text-white font-semibold">Register Your Club</p>
              </div>
              <p className="text-xs text-sr-text-muted">Your club isn't on ScoutRank yet — set it up from scratch.</p>
            </button>
          </div>
        </div>
      )}

      {mode === 'claim' && (
        <div>
          <h1 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Search className="h-5 w-5 text-sr-purple-light" /> Claim Your Club</h1>
          {!selectedOrg ? (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for your club..." className="input-dark w-full mb-3" />
              {searching && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 text-sr-purple animate-spin" /></div>}
              <div className="space-y-2">
                {searchResults.map(org => (
                  <button key={org.id} onClick={() => setSelectedOrg(org)} className="w-full text-left card-premium p-3 hover:border-sr-purple/30 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-medium">{org.name}</p>
                      <p className="text-xs text-sr-text-muted">{[org.city, org.state, org.country].filter(Boolean).join(', ')}</p>
                      <p className="text-xs text-sr-purple-light">{ORG_TYPE_LABEL[org.type] ?? org.type}</p>
                    </div>
                    {org.verified && <Shield className="h-4 w-4 text-sr-blue" fill="currentColor" />}
                  </button>
                ))}
              </div>
              {search.trim() && !searching && searchResults.length === 0 && (
                <p className="text-xs text-sr-text-muted mt-3">No matches. If it's genuinely not listed yet, <button onClick={() => setMode('register')} className="text-sr-purple-light hover:text-white">register it instead</button>.</p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="card-premium p-3 flex items-center justify-between">
                <p className="text-sm text-white font-medium">{selectedOrg.name}</p>
                <button onClick={() => setSelectedOrg(null)} className="text-xs text-sr-text-muted hover:text-white">Change</button>
              </div>
              <ApplicantFields {...{ officialEmail, setOfficialEmail, applicantName, setApplicantName, applicantPosition, setApplicantPosition, proofDetails, setProofDetails }} />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit Claim
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'register' && (
        <div className="space-y-4">
          <h1 className="text-xl font-bold text-white mb-1 flex items-center gap-2"><Building2 className="h-5 w-5 text-sr-purple-light" /> Register Your Club</h1>
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Club Name</label>
            <input value={orgName} onChange={e => setOrgName(e.target.value)} className="input-dark w-full" placeholder="e.g. Burleigh Bombers" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-sr-silver mb-1.5">Type</label>
              <Select value={orgType} onChange={setOrgType} options={[{ value: 'club', label: 'Sporting Club' }, { value: 'school', label: 'School' }, { value: 'academy', label: 'Academy' }, { value: 'organisation', label: 'Sporting Organisation' }]} />
            </div>
            <div>
              <label className="block text-sm font-medium text-sr-silver mb-1.5">Sport(s)</label>
              <SearchableSelect value={orgSports[0] ?? ''} onChange={v => setOrgSports(v ? [v] : [])} options={SPORT_OPTIONS} placeholder="Select sport" />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-sr-silver mb-1.5">Country</label>
              <Select value={country} onChange={setCountry} options={COUNTRIES.map(c => ({ value: c, label: c }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-sr-silver mb-1.5">State</label>
              {getStatesForCountry(country) ? (
                <Select value={state} onChange={setState} options={(getStatesForCountry(country) ?? []).map(s => ({ value: s, label: s }))} />
              ) : (
                <input value={state} onChange={e => setState(e.target.value)} className="input-dark w-full" />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-sr-silver mb-1.5">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} className="input-dark w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Website <span className="text-sr-text-muted font-normal">(optional)</span></label>
            <input value={website} onChange={e => setWebsite(e.target.value)} className="input-dark w-full" placeholder="https://" />
          </div>
          <ApplicantFields {...{ officialEmail, setOfficialEmail, applicantName, setApplicantName, applicantPosition, setApplicantPosition, proofDetails, setProofDetails }} />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit Registration
          </button>
        </div>
      )}
    </div>
  );
}

function ApplicantFields({ officialEmail, setOfficialEmail, applicantName, setApplicantName, applicantPosition, setApplicantPosition, proofDetails, setProofDetails }: {
  officialEmail: string; setOfficialEmail: (v: string) => void;
  applicantName: string; setApplicantName: (v: string) => void;
  applicantPosition: string; setApplicantPosition: (v: string) => void;
  proofDetails: string; setProofDetails: (v: string) => void;
}) {
  return (
    <div className="space-y-3 pt-2 border-t border-sr-border">
      <p className="text-xs font-semibold text-sr-text-muted uppercase tracking-wide pt-2">Your details</p>
      <div>
        <label className="block text-sm font-medium text-sr-silver mb-1.5">Official Club Email</label>
        <input type="email" value={officialEmail} onChange={e => setOfficialEmail(e.target.value)} className="input-dark w-full" placeholder="you@yourclub.com" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Your Name</label>
          <input value={applicantName} onChange={e => setApplicantName(e.target.value)} className="input-dark w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Your Position</label>
          <input value={applicantPosition} onChange={e => setApplicantPosition(e.target.value)} className="input-dark w-full" placeholder="e.g. Head Coach, President" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-sr-silver mb-1.5">How can we verify you represent this club? <span className="text-sr-text-muted font-normal">(optional but speeds up review)</span></label>
        <textarea value={proofDetails} onChange={e => setProofDetails(e.target.value)} rows={2} className="input-dark w-full resize-none" placeholder="e.g. link to club website listing you as coach, official social media, etc." />
      </div>
    </div>
  );
}
