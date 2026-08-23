import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/BrandButton';
import { AdminTopNav } from '@/components/layout/AdminTopNav';
import { Shield, ChevronDown, ChevronUp, Check, X, AlertCircle, Loader2, FileText, ExternalLink } from 'lucide-react';

interface Submission {
  id: string;
  profile_id: string;
  legal_first_name: string;
  legal_last_name: string;
  organisation_name: string;
  organisation_type: string;
  role_title: string;
  country: string;
  state: string | null;
  city: string | null;
  org_email: string | null;
  org_website: string | null;
  additional_notes: string | null;
  status: string;
  admin_notes: string | null;
  submitted_at: string;
  profiles: { username: string; first_name: string; last_name: string; role: string };
  verification_documents: Array<{
    id: string;
    document_type: string;
    document_label: string | null;
    storage_path: string;
    file_name: string;
    credential_expires_at: string | null;
  }>;
}

export default function AdminVerificationPage() {
  const { profile, isAdmin } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [actioning, setActioning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('submitted');
  const [search, setSearch] = useState('');

  if (!isAdmin) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sr-text-muted">Admin access required.</p>
    </div>
  );

  const loadSubmissions = () => {
    setIsLoading(true);
    // Two separate queries merged client-side — same pattern as the Discover
    // fix, avoids the "Could not find a relationship" PostgREST embed failure
    // that breaks the whole query when schema cache doesn't detect the FK.
    Promise.all([
      supabase
        .from('verification_submissions')
        .select('*, verification_documents(*)')
        .eq('status', statusFilter)
        .order('submitted_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, username, first_name, last_name, role'),
    ]).then(([subsRes, profilesRes]) => {
      if (subsRes.error) console.error('[admin-verification] submissions error:', subsRes.error.message, subsRes.error);
      if (profilesRes.error) console.error('[admin-verification] profiles error:', profilesRes.error.message);

      const profileMap: Record<string, Submission['profiles']> = {};
      for (const p of (profilesRes.data ?? [])) {
        profileMap[(p as {id:string}).id] = p as Submission['profiles'];
      }

      const merged = ((subsRes.data ?? []) as unknown as Array<Submission & {profile_id: string}>).map(sub => ({
        ...sub,
        profiles: profileMap[sub.profile_id] ?? null,
      }));

      setSubmissions(merged as unknown as Submission[]);
      setIsLoading(false);
    });
  };

  useEffect(() => { loadSubmissions(); }, [statusFilter]);

  const getSignedUrl = async (path: string, docId: string) => {
    // Always generate a fresh signed URL — cached ones expire and are silently
    // stale. The extra round-trip is fine for a low-volume admin interface.
    const { data, error } = await supabase.storage
      .from('verification-docs')
      .createSignedUrl(path, 600);
    if (error || !data) {
      console.error('[admin-verification] signed URL error:', error?.message, 'path:', path);
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const action = async (submissionId: string, newStatus: string) => {
    setActioning(submissionId);
    const { error } = await supabase
      .from('verification_submissions')
      .update({
        status: newStatus,
        admin_notes: adminNotes[submissionId] || null,
        reviewer_id: profile?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', submissionId);
    setActioning(null);
    if (error) {
      console.error('[admin-verification] action error:', error.message, error);
      alert(`Failed to update submission: ${error.message}`);
      return;
    }
    loadSubmissions();
    setExpanded(null);
  };

  const STATUS_TABS = [
    { value: 'submitted', label: 'New' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'more_info_requested', label: 'More Info' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="min-h-screen bg-sr-bg">
      <AdminTopNav />
      <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-sr-purple" />
        <h1 className="text-2xl font-bold text-white">Verification Queue</h1>
      </div>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map(tab => (
            <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                statusFilter === tab.value ? 'bg-sr-purple text-white' : 'bg-sr-surface text-sr-text-muted border border-sr-border hover:text-white'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, username, org..."
          className="input-dark !w-56 text-xs py-1.5" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : submissions.filter(sub => !search || `${sub.legal_first_name} ${sub.legal_last_name} ${sub.profiles?.username} ${sub.organisation_name}`.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-sr-text-muted">No submissions with status: {statusFilter}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.filter(sub => !search || `${sub.legal_first_name} ${sub.legal_last_name} ${sub.profiles?.username} ${sub.organisation_name}`.toLowerCase().includes(search.toLowerCase())).map(sub => (
            <div key={sub.id} className="card-premium overflow-hidden">
              <div className="p-5 flex items-start justify-between gap-4 cursor-pointer"
                onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center flex-shrink-0">
                    <Shield className="h-5 w-5 text-sr-purple-light" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {sub.legal_first_name} {sub.legal_last_name}
                      <span className="text-sr-text-muted font-normal ml-2">@{sub.profiles?.username}</span>
                    </p>
                    <p className="text-xs text-sr-text-muted">
                      {sub.role_title} · {sub.organisation_name} · {[sub.country, sub.state].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-xs text-sr-text-muted mt-0.5">
                      Submitted {new Date(sub.submitted_at).toLocaleDateString()} · {sub.verification_documents?.length ?? 0} document(s)
                    </p>
                  </div>
                </div>
                {expanded === sub.id ? <ChevronUp className="h-4 w-4 text-sr-text-muted" /> : <ChevronDown className="h-4 w-4 text-sr-text-muted" />}
              </div>

              {expanded === sub.id && (
                <div className="border-t border-sr-border p-5 space-y-5">
                  {/* Details */}
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    {[
                      ['Role', sub.role_title],
                      ['Organisation', sub.organisation_name],
                      ['Org Type', sub.organisation_type],
                      ['Country', sub.country],
                      ['State', sub.state],
                      ['City', sub.city],
                      ['Org Email', sub.org_email],
                      ['Org Website', sub.org_website],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs text-sr-text-muted">{label}</p>
                        <p className="text-sr-silver">{value}</p>
                      </div>
                    ))}
                  </div>

                  {sub.additional_notes && (
                    <div>
                      <p className="text-xs text-sr-text-muted mb-1">Applicant Notes</p>
                      <p className="text-sm text-sr-silver bg-sr-surface rounded-lg p-3">{sub.additional_notes}</p>
                    </div>
                  )}

                  {/* Documents */}
                  {sub.verification_documents?.length > 0 && (
                    <div>
                      <p className="text-xs text-sr-text-muted mb-2">Documents</p>
                      <div className="space-y-2">
                        {sub.verification_documents.map(doc => (
                          <button key={doc.id} onClick={() => getSignedUrl(doc.storage_path, doc.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg bg-sr-surface border border-sr-border hover:border-sr-purple/30 text-left transition-colors">
                            <FileText className="h-4 w-4 text-sr-text-muted flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{doc.document_label || doc.document_type}</p>
                              <p className="text-xs text-sr-text-muted">{doc.file_name}</p>
                              {doc.credential_expires_at && <p className="text-xs text-sr-text-muted">Expires {doc.credential_expires_at}</p>}
                            </div>
                            <ExternalLink className="h-4 w-4 text-sr-text-muted flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Admin notes + actions */}
                  {statusFilter !== 'approved' && statusFilter !== 'rejected' && (
                    <>
                      <div>
                        <label className="block text-xs text-sr-text-muted mb-1">Notes to Applicant (optional)</label>
                        <textarea className="input-dark h-20 resize-none" placeholder="Visible to the applicant if you reject or request more info..."
                          value={adminNotes[sub.id] || ''} onChange={e => setAdminNotes(prev => ({ ...prev, [sub.id]: e.target.value }))} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="brand" size="sm" disabled={actioning === sub.id} onClick={() => action(sub.id, 'approved')}
                          icon={actioning === sub.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}>
                          Verify
                        </Button>
                        <Button variant="ghost" size="sm" disabled={!!actioning} onClick={() => action(sub.id, 'under_review')}>
                          Mark Under Review
                        </Button>
                        <Button variant="ghost" size="sm" disabled={!!actioning} onClick={() => action(sub.id, 'more_info_requested')}>
                          Request More Info
                        </Button>
                        <Button variant="danger" size="sm" disabled={!!actioning} onClick={() => action(sub.id, 'rejected')}
                          icon={<X className="h-4 w-4" />}>
                          Reject
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Show admin notes for already-actioned items */}
                  {sub.admin_notes && (statusFilter === 'approved' || statusFilter === 'rejected') && (
                    <div>
                      <p className="text-xs text-sr-text-muted mb-1">Admin Notes</p>
                      <p className="text-sm text-sr-silver bg-sr-surface rounded-lg p-3">{sub.admin_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
