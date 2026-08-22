import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { shortDate } from '@/utils/time';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Organisation, OrganisationRequest } from '@/lib/supabase';
import { COUNTRIES, getStatesForCountry } from '@/lib/locations';
import { getChildSafetyRequirement } from '@/lib/childSafety';
import { Button } from '@/components/ui/BrandButton';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { OrganisationLink } from '@/components/ui/OrganisationLink';
import {
  Shield, X, Loader2, ArrowLeft, Check, Upload,
  FileText, AlertCircle, Info, Search, Building2, Plus,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

type DocumentType =
  | 'child_safety_clearance' | 'coaching_accreditation' | 'scouting_accreditation'
  | 'staff_id' | 'appointment_letter' | 'affiliation_proof' | 'other';

interface PendingDocument {
  id: string; documentType: DocumentType; documentLabel: string;
  file: File; storagePath: string | null; credentialExpiresAt: string;
  uploading: boolean; uploaded: boolean; error: string | null;
}

interface Submission {
  id: string; status: string; organisation_name: string; organisation_id: string | null; role_title: string;
  country: string; state: string | null; admin_notes: string | null;
  submitted_at: string; reviewed_at: string | null;
}

// ─── constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'child_safety_clearance', label: 'Working With Children / Child Safety Clearance' },
  { value: 'coaching_accreditation', label: 'Coaching Accreditation' },
  { value: 'scouting_accreditation', label: 'Scouting Accreditation' },
  { value: 'staff_id', label: 'Staff ID / Employment Card' },
  { value: 'appointment_letter', label: 'Appointment / Employment Letter' },
  { value: 'affiliation_proof', label: 'Proof of Affiliation' },
  { value: 'other', label: 'Other Document' },
];

const EXPIRY_RULE: Record<DocumentType, 'required' | 'optional' | 'none'> = {
  child_safety_clearance: 'required', coaching_accreditation: 'required',
  scouting_accreditation: 'required', staff_id: 'optional',
  appointment_letter: 'none', affiliation_proof: 'none', other: 'optional',
};

const ORG_TYPE_OPTIONS = [
  { value: 'club', label: 'Sporting Club' }, { value: 'school', label: 'School' },
  { value: 'academy', label: 'Academy' }, { value: 'organisation', label: 'Sporting Organisation' },
  { value: 'independent', label: 'Independent / Freelance' },
];

const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted — Awaiting Review', under_review: 'Under Review',
  approved: 'Approved', rejected: 'Rejected',
  more_info_requested: 'More Information Requested',
};

// ─── main component ───────────────────────────────────────────────────────────

export default function VerificationStatusPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const verificationStatus = profile?.coach_scout_verification_status;

  // Show the form when the user has never applied or was rejected
  const showForm = !verificationStatus || verificationStatus === 'rejected';

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('verification_submissions')
      .select('id, status, organisation_name, organisation_id, role_title, country, state, admin_notes, submitted_at, reviewed_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Failed to load verification submissions:', error.message);
        setSubmissions((data as Submission[] | null) ?? []);
        setIsLoading(false);
      });
  }, [profile?.id]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 text-sr-purple animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-sr-text-muted hover:text-white hover:bg-sr-surface-light transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center">
          <Shield className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Verification Centre</h1>
          <p className="text-sm text-sr-text-muted">ScoutRank coach &amp; scout verification</p>
        </div>
      </div>

      {/* Status banner — always shown */}
      {verificationStatus && (
        <div className="card-premium p-5 mb-6">
          <div className="flex items-center gap-4">
            <VerificationBadge status={verificationStatus} role={profile?.role} size="md" />
            <p className="text-sm text-sr-text-muted">
              {verificationStatus === 'pending' && "Your application is under review. We'll notify you when there's an update."}
              {verificationStatus === 'verified' && 'Your account is verified. You have full discoverability on ScoutRank.'}
              {verificationStatus === 'rejected' && 'Your most recent application was not approved. Complete the form below to resubmit.'}
              {verificationStatus === 'revoked' && 'Your verification has been revoked. Contact the ScoutRank team for more information.'}
            </p>
          </div>
        </div>
      )}

      {/* Inline application form — shown when never applied or rejected */}
      {showForm && profile && (
        <VerificationForm
          profile={profile}
          isResubmit={verificationStatus === 'rejected'}
          onSuccess={() => navigate(0)} // reload the page to show pending state
        />
      )}

      {/* Application history */}
      {submissions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-sr-silver mb-3">Application History</h2>
          <div className="space-y-3">
            {submissions.map(sub => (
              <div key={sub.id} className="card-premium p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <OrganisationLink
                      organisationId={sub.organisation_id}
                      name={sub.organisation_name}
                      className="text-sm font-medium text-white"
                    />
                    <p className="text-xs text-sr-text-muted">
                      {sub.role_title} · {[sub.country, sub.state].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-xs text-sr-text-muted mt-1">
                      Submitted {shortDate(sub.submitted_at)}
                      {sub.reviewed_at && ` · Reviewed ${shortDate(sub.reviewed_at)}`}
                    </p>
                    {sub.admin_notes && (
                      <div className="mt-3 p-2.5 rounded-lg bg-yellow-400/5 border border-yellow-400/20">
                        <p className="text-xs text-yellow-400 font-medium mb-0.5">Note from ScoutRank</p>
                        <p className="text-xs text-sr-silver">{sub.admin_notes}</p>
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                    sub.status === 'approved' ? 'bg-green-400/10 text-green-400' :
                    sub.status === 'rejected' ? 'bg-red-400/10 text-red-400' :
                    sub.status === 'more_info_requested' ? 'bg-yellow-400/10 text-yellow-400' :
                    'bg-sr-surface text-sr-text-muted'
                  }`}>
                    {SUBMISSION_STATUS_LABEL[sub.status] || sub.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-sr-border">
        <Link to="/dashboard">
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}

// ─── organisation search ──────────────────────────────────────────────────────

interface OrgSearchProps {
  value: string;                                // display text in the input
  selectedOrg: Organisation | null;            // the matched registry org, if any
  onChange: (name: string) => void;            // raw text changed (manual entry)
  onSelect: (org: Organisation) => void;        // user picked from dropdown
  onClear: () => void;                          // user cleared the selection
}

// Debounced search against the organisations table (active + verified only,
// per RLS). Minimum 2 characters before querying. Results are sorted by
// name server-side. Keyboard-navigable (↑/↓ to move, Enter to select,
// Escape to close). Clicking outside closes the panel.
function OrgSearch({ value, selectedOrg, onChange, onSelect, onClear }: OrgSearchProps) {
  const [results, setResults] = useState<Organisation[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('organisations')
        .select('*')
        .ilike('name', `%${q.trim()}%`)
        .eq('is_active', true)
        .eq('verified', true)
        .order('name')
        .limit(8);
      setLoading(false);
      if (error) { console.error('[org-search]', error.message); return; }
      setResults((data as Organisation[] | null) ?? []);
      setOpen(true);
      setHighlighted(0);
    }, 250);
  }, []);

  // Close when clicking outside.
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); onSelect(results[highlighted]); setOpen(false); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const orgTypeLabel: Record<string, string> = {
    club: 'Sporting Club', school: 'School', academy: 'Academy', organisation: 'Sporting Organisation',
  };

  if (selectedOrg) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-sr-purple/10 to-sr-blue/10 border border-sr-purple/30">
        <Building2 className="h-5 w-5 text-sr-purple-light flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <OrganisationLink organisationId={selectedOrg.id} name={selectedOrg.name} className="text-sm font-semibold text-white" />
          <p className="text-xs text-sr-text-muted">{orgTypeLabel[selectedOrg.type] ?? selectedOrg.type}{selectedOrg.city ? ` · ${selectedOrg.city}` : ''}{selectedOrg.state ? `, ${selectedOrg.state}` : ''}</p>
          <p className="text-[10px] text-green-400 mt-0.5">Verified organisation</p>
        </div>
        <button type="button" onClick={onClear} className="text-sr-text-muted hover:text-white flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Inner relative wrapper scoped to the input only — keeps the
          icon and spinner anchored to the input height regardless of
          whether the dropdown or "not listed" note are rendered below. */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted pointer-events-none z-10" />
        <input
          className="input-dark text-sm pr-9"
            style={{ paddingLeft: '2.75rem' }}
          placeholder="Search organisations..."
          value={value}
          onChange={e => { onChange(e.target.value); search(e.target.value); }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted animate-spin pointer-events-none" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-sr-border bg-sr-surface shadow-xl shadow-black/40 py-1 max-h-56 overflow-auto">
          {results.map((org, i) => (
            <li key={org.id}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => { onSelect(org); setOpen(false); }}
              className={`px-3 py-2.5 cursor-pointer transition-colors ${i === highlighted ? 'bg-sr-purple/20 text-white' : 'text-sr-silver hover:bg-sr-surface-light'}`}>
              <p className="text-sm font-medium">{org.name}</p>
              <p className="text-xs text-sr-text-muted">{orgTypeLabel[org.type] ?? org.type}{org.city ? ` · ${org.city}` : ''}{org.state ? `, ${org.state}` : ''}</p>
            </li>
          ))}
        </ul>
      )}

      {/* "Not listed" note — only after user has typed enough to trigger search */}
      {value.trim().length > 2 && !open && (
        <p className="mt-1.5 text-xs text-yellow-400 flex items-center gap-1.5">
          <Info className="h-3 w-3 flex-shrink-0" />
          Organisation not found in ScoutRank registry — will be marked unconfirmed. Verification may take longer.
        </p>
      )}
    </div>
  );
}

// ─── verification form ────────────────────────────────────────────────────────

interface VerificationFormProps {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isResubmit: boolean;
  onSuccess: () => void;
}

function VerificationForm({ profile, isResubmit, onSuccess }: VerificationFormProps) {
  const [legalFirstName, setLegalFirstName] = useState(profile.first_name || '');
  const [legalLastName, setLegalLastName]   = useState(profile.last_name || '');

  // Organisation — two modes:
  //   a) selectedOrg: user picked from the registry → use its id/name/type
  //   b) orgName (raw text) + orgType (manual): user typed it themselves
  const [selectedOrg, setSelectedOrg]   = useState<Organisation | null>(null);
  const [orgName, setOrgName]           = useState('');
  const [orgType, setOrgType]           = useState('club');

  const [roleTitle, setRoleTitle]           = useState('');
  const [country, setCountry]               = useState(profile.country || '');
  const [state, setState]                   = useState(profile.state || '');
  const [city, setCity]                     = useState(profile.city || '');

  const handleOrgSelect = (org: Organisation) => {
    setSelectedOrg(org);
    setOrgName(org.name);
    setOrgType(org.type);
    if (!country && org.country) setCountry(org.country);
    if (!state && org.state)     setState(org.state);
    if (!city && org.city)       setCity(org.city);
  };

  const handleOrgClear = () => {
    setSelectedOrg(null);
    setOrgName('');
    setOrgType('club');
  };
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [documents, setDocuments]     = useState<PendingDocument[]>([]);
  const [newDocType, setNewDocType]   = useState<DocumentType>('child_safety_clearance');
  const [newDocExpiry, setNewDocExpiry] = useState('');
  const [docStepError, setDocStepError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');

  // Organisation request sub-form state — shown when the user clicks
  // "Can't find your organisation?" below the OrgSearch.
  const [showOrgRequest, setShowOrgRequest]       = useState(false);
  const [reqName, setReqName]                     = useState('');
  const [reqType, setReqType]                     = useState('club');
  const [reqCountry, setReqCountry]               = useState('');
  const [reqState, setReqState]                   = useState('');
  const [reqCity, setReqCity]                     = useState('');
  const [reqWebsite, setReqWebsite]               = useState('');
  const [reqNotes, setReqNotes]                   = useState('');
  const [reqSubmitting, setReqSubmitting]         = useState(false);
  const [reqSuccess, setReqSuccess]               = useState(false);
  const [reqError, setReqError]                   = useState('');
  const reqStatesForCountry = useMemo(() => reqCountry ? getStatesForCountry(reqCountry) : null, [reqCountry]);

  const submitOrgRequest = async () => {
    setReqError('');
    if (!reqName.trim()) { setReqError('Organisation name is required.'); return; }
    if (!reqCountry)     { setReqError('Country is required.'); return; }
    setReqSubmitting(true);
    const { error: reqErr } = await supabase.from('organisation_requests').insert({
      requester_profile_id: profile.id,
      organisation_name: reqName.trim(),
      organisation_type: reqType,
      country: reqCountry,
      state: reqState || null,
      city: reqCity || null,
      website: reqWebsite.trim() || null,
      additional_notes: reqNotes.trim() || null,
    });
    setReqSubmitting(false);
    if (reqErr) { setReqError(reqErr.message); return; }
    setReqSuccess(true);
    // Pre-fill the main org name field with what they requested
    setOrgName(reqName.trim());
    setShowOrgRequest(false);
  };

  const statesForCountry = useMemo(() => country ? getStatesForCountry(country) : null, [country]);
  const childSafetyReq   = useMemo(() => getChildSafetyRequirement(country, state), [country, state]);
  const expiryRule = EXPIRY_RULE[newDocType];

  const resolveDocLabel = (type: DocumentType) => {
    if (type === 'child_safety_clearance' && childSafetyReq) {
      return `${childSafetyReq.documentName}${state ? ` — ${state}` : ''}`;
    }
    return DOCUMENT_TYPE_OPTIONS.find(o => o.value === type)?.label || type;
  };

  const handlePickFile = () => {
    setDocStepError('');
    if (expiryRule === 'required' && !newDocExpiry) {
      setDocStepError('Please enter the expiry date for this document before uploading.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setDocStepError('');

    const pending: PendingDocument = {
      id: `doc-${Date.now()}`,
      documentType: newDocType,
      documentLabel: resolveDocLabel(newDocType),
      file, storagePath: null,
      credentialExpiresAt: newDocExpiry,
      uploading: true, uploaded: false, error: null,
    };
    setDocuments(prev => [...prev, pending]);
    setNewDocExpiry('');

    try {
      const path = `${profile.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('verification-docs')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        console.error('[verification-docs] upload error:', JSON.stringify(uploadError));
        throw new Error(uploadError.message);
      }
      setDocuments(prev => prev.map(d =>
        d.id === pending.id ? { ...d, storagePath: path, uploading: false, uploaded: true } : d
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setDocuments(prev => prev.map(d =>
        d.id === pending.id ? { ...d, uploading: false, error: msg } : d
      ));
    }
  };

  const removeDocument = (id: string) => setDocuments(prev => prev.filter(d => d.id !== id));

  const handleSubmit = async () => {
    setError('');
    if (!legalFirstName.trim() || !legalLastName.trim()) { setError('Please enter your legal name.'); return; }
    if (!orgName.trim())   { setError('Please enter your organisation name.'); return; }
    if (!roleTitle.trim()) { setError('Please enter your role title.'); return; }
    if (!country)          { setError('Please select your country.'); return; }
    if (documents.some(d => d.uploading)) { setError('Please wait for all documents to finish uploading.'); return; }
    if (documents.some(d => d.error))     { setError('Some documents failed to upload. Please remove them and try again.'); return; }

    setSubmitting(true);
    try {
      const { data: submission, error: subError } = await supabase
        .from('verification_submissions')
        .insert({
          profile_id: profile.id,
          legal_first_name: legalFirstName.trim(),
          legal_last_name: legalLastName.trim(),
          organisation_id: selectedOrg?.id ?? null,
          organisation_name: orgName.trim(),
          organisation_type: orgType,
          role_title: roleTitle.trim(),
          country, state: state || null, city: city || null,
          additional_notes: additionalNotes.trim() || null,
        })
        .select('id').single();

      if (subError || !submission) throw new Error(subError?.message || 'Failed to create submission');

      const uploadedDocs = documents.filter(d => d.uploaded && d.storagePath);
      if (uploadedDocs.length > 0) {
        const { error: docsError } = await supabase.from('verification_documents').insert(
          uploadedDocs.map(d => ({
            submission_id: submission.id, profile_id: profile.id,
            document_type: d.documentType, document_label: d.documentLabel,
            storage_path: d.storagePath, file_name: d.file.name,
            credential_expires_at: d.credentialExpiresAt || null,
          }))
        );
        if (docsError) throw new Error(docsError.message);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-white">
        {isResubmit ? 'Resubmit Verification Application' : 'Apply for Verification'}
      </h2>
      <p className="text-sm text-sr-text-muted">
        Verification lets athletes and families trust that you are a real, qualified{' '}
        {profile.role === 'coach' ? 'coach' : 'scout'}. Verified accounts receive a badge and full discoverability across all age groups.
      </p>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Identity */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Your Legal Name</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-sr-text-muted mb-1">Legal First Name *</label>
            <input className="input-dark" value={legalFirstName} onChange={e => setLegalFirstName(e.target.value)} placeholder="As on your ID" />
          </div>
          <div>
            <label className="block text-xs text-sr-text-muted mb-1">Legal Last Name *</label>
            <input className="input-dark" value={legalLastName} onChange={e => setLegalLastName(e.target.value)} placeholder="As on your ID" />
          </div>
        </div>
      </div>

      {/* Organisation */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Organisation</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-sr-text-muted mb-1">Organisation Name *</label>
            <OrgSearch
              value={orgName}
              selectedOrg={selectedOrg}
              onChange={setOrgName}
              onSelect={handleOrgSelect}
              onClear={handleOrgClear}
            />

            {/* Organisation request sub-form */}
            {reqSuccess && (
              <div className="mt-2 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs flex items-center gap-2">
                <Check className="h-3.5 w-3.5 flex-shrink-0" />
                Request submitted — we'll review it and add it to the registry.
              </div>
            )}
            {!reqSuccess && !showOrgRequest && (
              <button type="button" onClick={() => setShowOrgRequest(true)}
                className="mt-1.5 text-xs text-sr-purple-light hover:text-sr-purple transition-colors">
                Can't find your organisation? Request it be added →
              </button>
            )}
            {showOrgRequest && (
              <div className="mt-3 p-4 rounded-xl border border-sr-border bg-sr-surface space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Request an Organisation</p>
                  <button type="button" onClick={() => { setShowOrgRequest(false); setReqError(''); }}
                    className="text-sr-text-muted hover:text-white"><X className="h-4 w-4" /></button>
                </div>
                <p className="text-xs text-sr-text-muted">
                  Our team will review and add it to the registry. You can still submit your verification now using manual entry above.
                </p>
                {reqError && (
                  <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="h-3 w-3 flex-shrink-0" />{reqError}</p>
                )}
                <div>
                  <label className="block text-xs text-sr-text-muted mb-1">Organisation Name *</label>
                  <input className="input-dark text-sm" value={reqName} onChange={e => setReqName(e.target.value)} placeholder="e.g. Gold Coast Suns Academy" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-sr-text-muted mb-1">Type</label>
                    <Select value={reqType} onChange={setReqType} options={ORG_TYPE_OPTIONS} />
                  </div>
                  <div>
                    <label className="block text-xs text-sr-text-muted mb-1">Country *</label>
                    <Select value={reqCountry} onChange={v => { setReqCountry(v); setReqState(''); }}
                      placeholder="Select country" options={COUNTRIES.map(c => ({ value: c, label: c }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-sr-text-muted mb-1">State / Region</label>
                    <Select value={reqState} onChange={setReqState}
                      placeholder={reqStatesForCountry ? 'Select state' : 'N/A'} disabled={!reqStatesForCountry}
                      options={(reqStatesForCountry || []).map(s => ({ value: s, label: s }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-sr-text-muted mb-1">City (optional)</label>
                    <input className="input-dark text-sm" value={reqCity} onChange={e => setReqCity(e.target.value)} placeholder="e.g. Brisbane" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-sr-text-muted mb-1">Website (optional)</label>
                  <input className="input-dark text-sm" type="url" value={reqWebsite} onChange={e => setReqWebsite(e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs text-sr-text-muted mb-1">Additional Notes (optional)</label>
                  <textarea className="input-dark text-sm h-16 resize-none" value={reqNotes} onChange={e => setReqNotes(e.target.value)}
                    placeholder="Any helpful context for the ScoutRank team..." />
                </div>
                <Button type="button" variant="brand" size="sm" onClick={submitOrgRequest} disabled={reqSubmitting}
                  icon={reqSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
                  {reqSubmitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Type only editable for manual entry — locked when a registry org is selected */}
            <div>
              <label className="block text-xs text-sr-text-muted mb-1">
                Type {selectedOrg && <span className="text-sr-text-muted font-normal">(from registry)</span>}
              </label>
              <Select value={orgType} onChange={setOrgType} options={ORG_TYPE_OPTIONS} disabled={!!selectedOrg} />
            </div>
            <div>
              <label className="block text-xs text-sr-text-muted mb-1">Your Role *</label>
              <input className="input-dark" value={roleTitle} onChange={e => setRoleTitle(e.target.value)} placeholder="e.g. Head Coach" />
            </div>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Your Location</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-sr-text-muted mb-1">Country *</label>
              <Select value={country} onChange={v => { setCountry(v); setState(''); }}
                placeholder="Select country" options={COUNTRIES.map(c => ({ value: c, label: c }))} />
            </div>
            <div>
              <label className="block text-xs text-sr-text-muted mb-1">State / Region</label>
              <Select value={state} onChange={setState}
                placeholder={statesForCountry ? 'Select state' : 'N/A'} disabled={!statesForCountry}
                options={(statesForCountry || []).map(s => ({ value: s, label: s }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-sr-text-muted mb-1">City (optional)</label>
            <input className="input-dark" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Brisbane" />
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-semibold text-white mb-1">Supporting Documents</h3>
        <p className="text-xs text-sr-text-muted mb-3">Upload as many relevant documents as you have.</p>
        {childSafetyReq && (
          <div className="mb-4 p-3 rounded-lg bg-sr-surface border border-sr-border text-xs text-sr-silver">
            For <strong>{country}{state ? ` (${state})` : ''}</strong>, the required child-safety clearance is a{' '}
            <strong>{childSafetyReq.documentName}</strong> issued by {childSafetyReq.authority}.
            {childSafetyReq.url && (
              <> <a href={childSafetyReq.url} target="_blank" rel="noopener noreferrer"
                className="text-sr-purple-light hover:underline">Apply here →</a></>
            )}
          </div>
        )}

        {documents.length > 0 && (
          <div className="space-y-2 mb-4">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl bg-sr-surface border border-sr-border">
                <FileText className="h-4 w-4 text-sr-text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{doc.documentLabel}</p>
                  <p className="text-xs text-sr-text-muted truncate">{doc.file.name}</p>
                  {doc.credentialExpiresAt && (
                    <p className="text-xs text-sr-text-muted">Expires: {shortDate(doc.credentialExpiresAt)}</p>
                  )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {doc.uploading && <Loader2 className="h-4 w-4 text-sr-purple animate-spin" />}
                  {doc.uploaded && <Check className="h-4 w-4 text-green-400" />}
                  {doc.error && <span className="text-xs text-red-400 max-w-[120px] truncate" title={doc.error}>Failed</span>}
                  <button type="button" onClick={() => removeDocument(doc.id)} className="text-sr-text-muted hover:text-red-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-dashed border-sr-border p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-sr-silver mb-1.5">1. Document type</label>
            <Select value={newDocType} onChange={v => { setNewDocType(v as DocumentType); setNewDocExpiry(''); setDocStepError(''); }}
              options={DOCUMENT_TYPE_OPTIONS} />
          </div>
          {expiryRule !== 'none' && (
            <div>
              <label className="block text-xs font-medium text-sr-silver mb-1.5">
                2. Expiry date
                {expiryRule === 'required' ? <span className="text-red-400 ml-1">*</span>
                  : <span className="text-sr-text-muted ml-1">(optional)</span>}
              </label>
              <input type="date" className="input-dark" value={newDocExpiry}
                onChange={e => { setNewDocExpiry(e.target.value); setDocStepError(''); }} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-sr-silver mb-1.5">
              {expiryRule === 'none' ? '2.' : '3.'} Upload file
            </label>
            {docStepError && (
              <p className="mb-2 text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />{docStepError}
              </p>
            )}
            <Button type="button" variant="ghost" size="sm" icon={<Upload className="h-4 w-4" />} onClick={handlePickFile}>
              Select File
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx"
              onChange={handleFileSelect} className="hidden" />
            <p className="mt-1.5 text-xs text-sr-text-muted">Accepted: images (JPG, PNG), PDF, Word documents</p>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-semibold text-white mb-2">Additional Notes (optional)</h3>
        <textarea className="input-dark h-20 resize-none" placeholder="Any additional context for the ScoutRank team..."
          value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} />
      </div>

      <div className="flex gap-3">
        <Button variant="brand" onClick={handleSubmit} disabled={submitting}
          icon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}>
          {submitting ? 'Submitting...' : isResubmit ? 'Resubmit Application' : 'Submit for Verification'}
        </Button>
      </div>
      <p className="text-xs text-sr-text-muted">
        Verification is reviewed by the ScoutRank team. Do not submit false information.
        Your documents are stored securely and only reviewed by ScoutRank administrators.
      </p>
    </div>
  );
}
