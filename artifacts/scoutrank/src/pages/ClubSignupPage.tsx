import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { COUNTRIES, getStatesForCountry } from '@/lib/locations';
import { SPORT_OPTIONS } from '@/lib/sports';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ArrowLeft, Building2, Loader2, Eye, EyeOff } from 'lucide-react';

// Turns a club name into a reasonable account username — lowercase,
// alphanumeric only, capped at a sane length, plus a short random suffix
// so two clubs with the same/similar name don't collide (there's no
// live "is this username taken" check here, same as the regular signup
// form — a collision just surfaces as whatever error the signup trigger
// already throws for a duplicate username today).
function slugifyClubName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'club';
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}${suffix}`;
}

/**
 * A genuinely separate signup flow for clubs — not an existing user
 * adding a claim, but a brand-new account created specifically to
 * represent a club. The account exists immediately (so nothing is lost
 * if they close the tab), but account_status stays at
 * 'pending_club_approval' — the same gating mechanism already used for
 * suspended/banned accounts — so they genuinely cannot log in and use
 * the app until an admin approves the application and activates it.
 *
 * The account's own identity (first_name/last_name/username — what shows
 * up as "who's logged in" anywhere in the app, if this account is ever
 * looked at outside its org page) is the CLUB's name, not the applicant's
 * personal name — this used to use the applicant's own first/last
 * name/username for the account itself, which meant the account still
 * read as "Harry Moulp, coach" everywhere except the org page specifically.
 * The applicant's real name and position are still captured and stored
 * (on the organisation_claims row, for the admin reviewing the
 * application) — they're just no longer what the account presents as.
 *
 * Known limitation this doesn't fully solve: the account's `role` column
 * is still 'coach' underneath (the closest existing fit — there's no
 * dedicated 'organisation' role in the schema yet), so anything in the
 * app that's coach-specific (e.g. the coach verification flow) can still
 * technically apply to a club account. Splitting out a real
 * 'organisation' role is a bigger, separate change — this pass fixes what
 * the account is called and looks like, not the underlying role enum.
 */
export default function ClubSignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [applicantPosition, setApplicantPosition] = useState('');
  const [proofDetails, setProofDetails] = useState('');

  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('club');
  const [orgSports, setOrgSports] = useState<string[]>([]);
  const [country, setCountry] = useState('Australia');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');

  const submit = async () => {
    setError('');
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || !dateOfBirth) {
      setError('Please fill in all your personal details.'); return;
    }
    if (!orgName.trim() || !applicantPosition.trim()) {
      setError('Club name and your position are required.'); return;
    }

    setSubmitting(true);
    try {
      // Creates the real account — role is 'coach' underneath (the
      // closest existing fit for someone administratively representing
      // a club), but account_status keeps them locked out of the app
      // until the application below is actually approved.
      //
      // firstName/lastName/username here are the CLUB's identity, not the
      // applicant's personal name — this is what the account presents as
      // everywhere in the app. The applicant's actual name/position (typed
      // in above) still gets recorded, just on the organisation_claims
      // insert below rather than becoming the account's own identity.
      await signup({
        firstName: orgName.trim(), lastName: '', username: slugifyClubName(orgName),
        email: email.trim(), password, dateOfBirth,
        country, state, city: city.trim(),
        primarySport: orgSports[0] ?? '', secondarySports: [], currentClub: orgName.trim(),
        role: 'coach',
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Account created, but could not confirm the session — please check your email to confirm, then contact support to finish your club application.');

      const { error: statusErr } = await supabase.from('profiles').update({ account_status: 'pending_club_approval' }).eq('id', user.id);
      if (statusErr) throw new Error(`Account created, but failed to set pending status: ${statusErr.message}`);

      const { error: claimErr } = await supabase.from('organisation_claims').insert({
        claimant_id: user.id,
        claim_type: 'register',
        new_org_name: orgName.trim(),
        new_org_type: orgType,
        new_org_sports: orgSports,
        new_org_country: country,
        new_org_state: state,
        new_org_city: city.trim(),
        new_org_website: website.trim() || null,
        official_email: email.trim(),
        applicant_name: `${firstName.trim()} ${lastName.trim()}`,
        applicant_position: applicantPosition.trim(),
        proof_details: proofDetails.trim() || null,
      });
      if (claimErr) throw new Error(`Account created, but failed to submit your club application: ${claimErr.message}`);

      navigate('/club-application-pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link to="/signup" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2"><Building2 className="h-6 w-6 text-sr-purple-light" /> Register Your Club</h1>
      <p className="text-sm text-sr-text-muted mb-6">Create your account and submit your club for review — you won't be able to log in until it's approved.</p>

      <div className="space-y-4">
        <p className="text-xs font-semibold text-sr-text-muted uppercase tracking-wide">Your Details (for our records)</p>
        <p className="text-xs text-sr-text-muted -mt-2">Who you are and your role at the club, so we can verify this application — this is not what shows up as the club's identity on ScoutRank.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">First Name</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} className="input-dark w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Last Name</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} className="input-dark w-full" />
          </div>
        </div>

        <p className="text-xs font-semibold text-sr-text-muted uppercase tracking-wide pt-2 border-t border-sr-border">Club Login</p>
        <p className="text-xs text-sr-text-muted -mt-2">This becomes the club's own login and identity on ScoutRank — whoever's signed in for the club uses this email and password once the application is approved, and the club (not your personal name) is what shows up as logged in.</p>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Club Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-dark w-full" placeholder="e.g. contact@yourclub.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Club Password</label>
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input-dark w-full pr-10" placeholder="Min. 6 characters" />
            <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sr-text-muted">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Your Date of Birth</label>
          <input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} className="input-dark w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Your Position at the Club</label>
          <input value={applicantPosition} onChange={e => setApplicantPosition(e.target.value)} className="input-dark w-full" placeholder="e.g. Head Coach, President" />
        </div>

        <p className="text-xs font-semibold text-sr-text-muted uppercase tracking-wide pt-2 border-t border-sr-border">Club Details</p>
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
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Sport</label>
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
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">How can we verify you represent this club? <span className="text-sr-text-muted font-normal">(optional but speeds up review)</span></label>
          <textarea value={proofDetails} onChange={e => setProofDetails(e.target.value)} rows={2} className="input-dark w-full resize-none" />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Account & Submit for Review
        </button>
        <p className="text-center text-xs text-sr-text-muted">Already have an account? <Link to="/login" className="text-sr-purple-light hover:text-white">Log in</Link></p>
      </div>
    </div>
  );
}
