import { useState, useEffect } from 'react';
import { shortDate } from '@/utils/time';
import { OrganisationLink } from '@/components/ui/OrganisationLink';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { OrganisationRequest } from '@/lib/supabase';
import { Button } from '@/components/ui/BrandButton';
import { AdminTopNav } from '@/components/layout/AdminTopNav';
import { Inbox, Check, X, ChevronDown, ChevronUp, Loader2, AlertCircle, Building2, ExternalLink } from 'lucide-react';

interface RequestWithProfile extends OrganisationRequest {
  profiles: { username: string; first_name: string; last_name: string } | null;
}

const STATUS_TABS = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function AdminOrganisationRequestsPage() {
  const { profile, isAdmin } = useAuth();
  const [statusFilter, setStatusFilter]   = useState('pending');
  const [requests, setRequests]           = useState<RequestWithProfile[]>([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [adminNotes, setAdminNotes]       = useState<Record<string, string>>({});
  const [actioning, setActioning]         = useState<string | null>(null);
  const [actionError, setActionError]     = useState('');

  if (!isAdmin) return (
    <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>
  );

  const load = () => {
    setIsLoading(true);
    setActionError('');
    // Two-query pattern — avoids PostgREST embed detection issues.
    Promise.all([
      supabase.from('organisation_requests').select('*').eq('status', statusFilter).order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, username, first_name, last_name'),
    ]).then(([reqRes, profRes]) => {
      if (reqRes.error) console.error('[admin-org-requests] load error:', reqRes.error.message);
      const profileMap: Record<string, RequestWithProfile['profiles']> = {};
      for (const p of (profRes.data ?? [])) profileMap[(p as {id:string}).id] = p as RequestWithProfile['profiles'];
      const merged = ((reqRes.data ?? []) as unknown as OrganisationRequest[]).map(r => ({
        ...r, profiles: profileMap[r.requester_profile_id] ?? null,
      }));
      setRequests(merged as RequestWithProfile[]);
      setIsLoading(false);
    });
  };

  useEffect(() => { load(); }, [statusFilter]);

  const action = async (req: RequestWithProfile, newStatus: 'approved' | 'rejected') => {
    setActioning(req.id);
    setActionError('');

    // Approving here previously only ever updated organisation_requests.status
    // — the copy right below the buttons tells the admin "Approving will
    // automatically add this organisation to the registry as verified,"
    // but nothing actually created the organisations row or set
    // reviewed_organisation_id, so that never happened and the "View in
    // registry" link for an approved request was always dead. This now
    // does what the UI already promises.
    let reviewedOrganisationId: string | null = null;
    if (newStatus === 'approved') {
      const { data: newOrg, error: orgErr } = await supabase.from('organisations').insert({
        name: req.organisation_name,
        type: req.organisation_type,
        sports: [],
        country: req.country,
        state: req.state,
        city: req.city,
        website: req.website,
        verified: true,
        is_active: true,
      }).select('id').single();
      if (orgErr || !newOrg) {
        console.error('[admin-org-requests] failed to create organisation:', orgErr?.message);
        setActioning(null);
        setActionError(`Failed to add organisation to the registry: ${orgErr?.message ?? 'unknown error'}`);
        return;
      }
      reviewedOrganisationId = newOrg.id;
    }

    const { error } = await supabase.from('organisation_requests').update({
      status: newStatus,
      admin_notes: adminNotes[req.id] || null,
      reviewer_id: profile?.id,
      reviewed_at: new Date().toISOString(),
      ...(reviewedOrganisationId ? { reviewed_organisation_id: reviewedOrganisationId } : {}),
    }).eq('id', req.id);
    setActioning(null);
    if (error) {
      console.error('[admin-org-requests] action error:', error.message, error);
      setActionError(
        reviewedOrganisationId
          ? `Organisation was added to the registry, but failed to update this request's status: ${error.message}. Organisation id: ${reviewedOrganisationId}.`
          : `Failed: ${error.message}`
      );
      return;
    }
    load();
    setExpandedId(null);
  };

  const ORG_TYPE_LABEL: Record<string, string> = {
    club: 'Sporting Club', school: 'School', academy: 'Academy', organisation: 'Sporting Organisation',
  };

  return (
    <div className="min-h-screen bg-sr-bg">
      <AdminTopNav />
      <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Inbox className="h-7 w-7 text-sr-purple" />
        <h1 className="text-2xl font-bold text-white">Organisation Requests</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">
          {requests.length} {statusFilter}
        </span>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === tab.value
                ? 'bg-sr-purple text-white'
                : 'bg-sr-surface text-sr-text-muted border border-sr-border hover:text-white'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{actionError}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Inbox className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-sr-text-muted">No {statusFilter} requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="card-premium overflow-hidden">
              {/* Summary row */}
              <div className="p-5 flex items-start justify-between gap-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-sr-purple-light" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{req.organisation_name}</p>
                    <p className="text-xs text-sr-text-muted">
                      {ORG_TYPE_LABEL[req.organisation_type] ?? req.organisation_type}
                      {req.country && ` · ${[req.city, req.state, req.country].filter(Boolean).join(', ')}`}
                    </p>
                    <p className="text-xs text-sr-text-muted mt-0.5">
                      Requested by {req.profiles
                        ? `${req.profiles.first_name} ${req.profiles.last_name} (@${req.profiles.username})`
                        : 'unknown'
                      } · {shortDate(req.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    req.status === 'approved' ? 'bg-green-400/10 text-green-400' :
                    req.status === 'rejected' ? 'bg-red-400/10 text-red-400' :
                    'bg-yellow-400/10 text-yellow-400'
                  }`}>{req.status}</span>
                  {expandedId === req.id ? <ChevronUp className="h-4 w-4 text-sr-text-muted" /> : <ChevronDown className="h-4 w-4 text-sr-text-muted" />}
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === req.id && (
                <div className="border-t border-sr-border p-5 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    {[
                      ['Name', req.organisation_name],
                      ['Type', ORG_TYPE_LABEL[req.organisation_type]],
                      ['Country', req.country],
                      ['State', req.state],
                      ['City', req.city],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <div key={label as string}>
                        <p className="text-xs text-sr-text-muted">{label}</p>
                        <p className="text-sr-silver">{value}</p>
                      </div>
                    ))}
                    {req.website && (
                      <div>
                        <p className="text-xs text-sr-text-muted">Website</p>
                        <a href={req.website} target="_blank" rel="noopener noreferrer"
                          className="text-sr-purple-light hover:underline flex items-center gap-1 text-sm">
                          {req.website} <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {req.additional_notes && (
                    <div>
                      <p className="text-xs text-sr-text-muted mb-1">Notes from requester</p>
                      <p className="text-sm text-sr-silver bg-sr-surface rounded-lg p-3">{req.additional_notes}</p>
                    </div>
                  )}

                  {req.status === 'pending' && (
                    <>
                      <div>
                        <label className="block text-xs text-sr-text-muted mb-1">Admin Notes (optional — shown to requester if rejected)</label>
                        <textarea className="input-dark h-16 resize-none text-sm"
                          placeholder="Reason for rejection, or additional info needed..."
                          value={adminNotes[req.id] || ''}
                          onChange={e => setAdminNotes(prev => ({ ...prev, [req.id]: e.target.value }))} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="brand" size="sm" disabled={actioning === req.id}
                          onClick={() => action(req, 'approved')}
                          icon={actioning === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}>
                          Approve & Add to Registry
                        </Button>
                        <Button variant="danger" size="sm" disabled={!!actioning}
                          onClick={() => action(req, 'rejected')}
                          icon={<X className="h-4 w-4" />}>
                          Reject
                        </Button>
                      </div>
                      <p className="text-xs text-sr-text-muted">
                        Approving will automatically add this organisation to the registry as verified, making it searchable in autocomplete immediately.
                      </p>
                    </>
                  )}

                  {req.status !== 'pending' && (
                    <div>
                      <p className="text-xs text-sr-text-muted">
                        {req.status === 'approved' ? 'Approved' : 'Rejected'} on {req.reviewed_at ? shortDate(req.reviewed_at) : '—'}
                        {req.reviewed_organisation_id && (
                          <OrganisationLink
                            organisationId={req.reviewed_organisation_id}
                            name="View in registry →"
                            className="ml-2 text-green-400"
                          />
                        )}
                      </p>
                      {req.admin_notes && (
                        <p className="mt-2 text-sm text-sr-silver bg-sr-surface rounded-lg p-3">{req.admin_notes}</p>
                      )}
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
