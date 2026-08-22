import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Organisation } from '@/lib/supabase';
import { Button } from '@/components/ui/BrandButton';
import { Select } from '@/components/ui/Select';
import { SPORT_OPTIONS } from '@/lib/sports';
import { COUNTRIES, getStatesForCountry } from '@/lib/locations';
import { Building2, Search, Plus, Check, X, Pencil, Loader2,
  ChevronDown, ChevronUp, Shield, AlertCircle, ToggleLeft, ToggleRight, ArrowLeft,
} from 'lucide-react';
import { formatSportName } from '@/utils/format';
import { OrganisationLink } from '@/components/ui/OrganisationLink';

const ORG_TYPE_OPTIONS = [
  { value: 'club', label: 'Sporting Club' },
  { value: 'school', label: 'School' },
  { value: 'academy', label: 'Academy' },
  { value: 'organisation', label: 'Sporting Organisation' },
];

const BLANK_FORM = {
  name: '', type: 'club' as Organisation['type'],
  sports: [] as string[], country: '', state: '', city: '',
  website: '', official_email: '', verified: false, is_active: true,
};

export default function AdminOrganisationsPage() {
  const { isAdmin } = useAuth();
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  // Add / Edit state
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const statesForCountry = useMemo(
    () => form.country ? getStatesForCountry(form.country) : null,
    [form.country]
  );

  if (!isAdmin) return (
    <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>
  );

  const load = () => {
    setIsLoading(true);
    // Admin can see all orgs including inactive/unverified — use a
    // separate unfiltered query here since RLS's public policy only
    // returns verified+active rows.
    supabase
      .from('organisations')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('[admin-orgs] load error:', error.message, error);
        setOrgs((data as Organisation[] | null) ?? []);
        setIsLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => orgs.filter(o => {
    if (search && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter && o.type !== typeFilter) return false;
    if (countryFilter && o.country !== countryFilter) return false;
    return true;
  }), [orgs, search, typeFilter, countryFilter]);

  const field = (key: keyof typeof form, val: unknown) =>
    setForm(f => ({ ...f, [key]: val }));

  const toggleSport = (slug: string) =>
    field('sports', form.sports.includes(slug)
      ? form.sports.filter(s => s !== slug)
      : [...form.sports, slug]);

  const openAdd = () => {
    setForm({ ...BLANK_FORM });
    setEditingId(null);
    setFormError('');
    setShowAdd(true);
  };

  const openEdit = (org: Organisation) => {
    setForm({
      name: org.name, type: org.type, sports: org.sports,
      country: org.country, state: org.state ?? '', city: org.city ?? '',
      website: org.website ?? '', official_email: org.official_email ?? '',
      verified: org.verified, is_active: org.is_active,
    });
    setEditingId(org.id);
    setFormError('');
    setShowAdd(true);
  };

  const cancelForm = () => { setShowAdd(false); setEditingId(null); setFormError(''); };

  const save = async () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Organisation name is required.'); return; }
    if (!form.type)        { setFormError('Organisation type is required.'); return; }
    if (!form.country)     { setFormError('Country is required.'); return; }
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      type: form.type,
      sports: form.sports,
      country: form.country,
      state: form.state || null,
      city: form.city || null,
      website: form.website.trim() || null,
      official_email: form.official_email.trim() || null,
      verified: form.verified,
      is_active: form.is_active,
    };

    const { error } = editingId
      ? await supabase.from('organisations').update(payload).eq('id', editingId)
      : await supabase.from('organisations').insert(payload);

    setSaving(false);
    if (error) {
      console.error('[admin-orgs] save error:', error.message, error);
      setFormError(error.message);
      return;
    }
    cancelForm();
    load();
  };

  const quickToggle = async (org: Organisation, field: 'verified' | 'is_active') => {
    const { error } = await supabase
      .from('organisations')
      .update({ [field]: !org[field] })
      .eq('id', org.id);
    if (error) { console.error('[admin-orgs] toggle error:', error.message); return; }
    setOrgs(prev => prev.map(o => o.id === org.id ? { ...o, [field]: !o[field] } : o));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-sr-purple" />
          <h1 className="text-2xl font-bold text-white">Organisation Registry</h1>
          <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">
            {orgs.length} total
          </span>
        </div>
        <Button variant="brand" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
          Add Organisation
        </Button>
      </div>

      {/* Search + filters */}
      <div className="card-premium p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted" />
          <input className="input-dark pl-9" placeholder="Search organisations..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onChange={setTypeFilter} className="w-auto min-w-[150px]"
          options={[{ value: '', label: 'All Types' }, ...ORG_TYPE_OPTIONS]} />
        <Select value={countryFilter} onChange={setCountryFilter} className="w-auto min-w-[150px]"
          options={[{ value: '', label: 'All Countries' }, ...COUNTRIES.map(c => ({ value: c, label: c }))]} />
        <span className="text-xs text-sr-text-muted">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <div className="card-premium p-6 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">{editingId ? 'Edit Organisation' : 'Add Organisation'}</h2>
          {formError && (
            <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{formError}
            </div>
          )}
          <div className="space-y-4">
            {/* Name + Type */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-sr-text-muted mb-1">Name *</label>
                <input className="input-dark" placeholder="e.g. Burleigh Bombers FC" value={form.name} onChange={e => field('name', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-sr-text-muted mb-1">Type *</label>
                <Select value={form.type} onChange={v => field('type', v)} options={ORG_TYPE_OPTIONS} />
              </div>
            </div>
            {/* Location */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-sr-text-muted mb-1">Country *</label>
                <Select value={form.country} onChange={v => { field('country', v); field('state', ''); }}
                  placeholder="Select country" options={COUNTRIES.map(c => ({ value: c, label: c }))} />
              </div>
              <div>
                <label className="block text-xs text-sr-text-muted mb-1">State / Region</label>
                <Select value={form.state} onChange={v => field('state', v)}
                  placeholder={statesForCountry ? 'Select state' : 'N/A'} disabled={!statesForCountry}
                  options={(statesForCountry || []).map(s => ({ value: s, label: s }))} />
              </div>
              <div>
                <label className="block text-xs text-sr-text-muted mb-1">City</label>
                <input className="input-dark" placeholder="e.g. Brisbane" value={form.city} onChange={e => field('city', e.target.value)} />
              </div>
            </div>
            {/* Contact */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-sr-text-muted mb-1">Official Email</label>
                <input className="input-dark" type="email" placeholder="contact@org.com.au" value={form.official_email} onChange={e => field('official_email', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-sr-text-muted mb-1">Website</label>
                <input className="input-dark" type="url" placeholder="https://..." value={form.website} onChange={e => field('website', e.target.value)} />
              </div>
            </div>
            {/* Sports */}
            <div>
              <label className="block text-xs text-sr-text-muted mb-2">Sports</label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {SPORT_OPTIONS.map(s => (
                  <button key={s.value} type="button" onClick={() => toggleSport(s.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      form.sports.includes(s.value)
                        ? 'border-sr-purple bg-sr-purple/10 text-white'
                        : 'border-sr-border bg-sr-surface text-sr-text-muted hover:border-sr-purple/30'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Flags */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-sr-purple" checked={form.verified} onChange={e => field('verified', e.target.checked)} />
                <span className="text-sm text-sr-silver">Verified by ScoutRank</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-sr-purple" checked={form.is_active} onChange={e => field('is_active', e.target.checked)} />
                <span className="text-sm text-sr-silver">Active (shows in search)</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <Button variant="brand" size="sm" onClick={save} disabled={saving}
              icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Organisation'}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-sr-text-muted">{orgs.length === 0 ? 'No organisations yet. Add the first one.' : 'No results match your filters.'}</p>
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-sr-text-muted border-b border-sr-border">
                  <th className="p-3 pl-5">Organisation</th>
                  <th className="p-3 hidden sm:table-cell">Location</th>
                  <th className="p-3 hidden md:table-cell">Sports</th>
                  <th className="p-3 text-center">Verified</th>
                  <th className="p-3 text-center">Active</th>
                  <th className="p-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(org => (
                  <>
                    <tr key={org.id}
                      className="border-b border-sr-border/50 hover:bg-sr-surface-light/30 transition-colors">
                      <td className="p-3 pl-5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setExpandedId(expandedId === org.id ? null : org.id)}
                            className="text-sr-text-muted hover:text-white">
                            {expandedId === org.id
                              ? <ChevronUp className="h-4 w-4" />
                              : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <div>
                            <OrganisationLink
                              organisationId={org.id}
                              name={org.name}
                              className="font-medium text-white"
                            />
                            <p className="text-xs text-sr-text-muted capitalize">{org.type}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-sr-text-muted hidden sm:table-cell">
                        {[org.city, org.state, org.country].filter(Boolean).join(', ')}
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {org.sports.slice(0, 3).map(s => (
                            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-sr-surface border border-sr-border text-sr-text-muted">
                              {formatSportName(s)}
                            </span>
                          ))}
                          {org.sports.length > 3 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sr-surface border border-sr-border text-sr-text-muted">
                              +{org.sports.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => quickToggle(org, 'verified')} title={org.verified ? 'Mark unverified' : 'Mark verified'}
                          className={`mx-auto flex items-center justify-center h-7 w-7 rounded-lg transition-colors ${
                            org.verified ? 'bg-green-400/10 text-green-400 hover:bg-red-400/10 hover:text-red-400'
                              : 'bg-sr-surface text-sr-text-muted hover:bg-green-400/10 hover:text-green-400'
                          }`}>
                          {org.verified ? <Check className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => quickToggle(org, 'is_active')} title={org.is_active ? 'Deactivate' : 'Activate'}
                          className={`mx-auto transition-colors ${org.is_active ? 'text-sr-purple-light hover:text-red-400' : 'text-sr-text-muted hover:text-sr-purple-light'}`}>
                          {org.is_active
                            ? <ToggleRight className="h-6 w-6" />
                            : <ToggleLeft className="h-6 w-6" />}
                        </button>
                      </td>
                      <td className="p-3 pr-5 text-right">
                        <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(org)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                    {expandedId === org.id && (
                      <tr key={`${org.id}-expanded`} className="border-b border-sr-border/50 bg-sr-surface/30">
                        <td colSpan={6} className="px-8 py-4 text-xs text-sr-text-muted space-y-1">
                          {org.official_email && <p>Email: <span className="text-sr-silver">{org.official_email}</span></p>}
                          {org.website && <p>Website: <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-sr-purple-light hover:underline">{org.website}</a></p>}
                          {org.sports.length > 0 && <p>Sports: <span className="text-sr-silver">{org.sports.map(formatSportName).join(', ')}</span></p>}
                          <p>Added: {new Date(org.created_at).toLocaleDateString()} · Updated: {new Date(org.updated_at).toLocaleDateString()}</p>
                          <p>ID: <code className="text-[10px] text-sr-text-muted">{org.id}</code></p>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
