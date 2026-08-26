import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import type { Profile, AthleteStat, StatEventType } from '@/lib/supabase';
import { Select } from '@/components/ui/Select';
import { scoreVerifiedStat } from '@/lib/aiScoring';
import { resolveStatEvidenceUrl } from '@/lib/statEvidence';
import { Button } from '@/components/ui/BrandButton';
import { formatSportName } from '@/utils/format';
import { AdminTopNav } from '@/components/layout/AdminTopNav';
import {
  BarChart3, Check, X, ExternalLink, Loader2, AlertCircle,
  ChevronDown, ChevronUp, Sparkles, ImageIcon, Play,
} from 'lucide-react';

interface PendingStatRow {
  stat: AthleteStat;
  athlete: Profile | null;
  eventType: StatEventType | null;
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isVideo(url: string | null) {
  if (!url) return false;
  return /\.(mp4|mov|webm|ogg|avi)(\?.*)?$/i.test(url);
}

export default function AdminPendingStatsPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<PendingStatRow[]>([]);
  const [allEventTypes, setAllEventTypes] = useState<StatEventType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [rejectError, setRejectError] = useState('');
  // Confirmation modals
  const [confirmVerify, setConfirmVerify] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  // Custom stat admin fields — keyed by stat id
  const [customAction, setCustomAction]   = useState<Record<string, 'attach' | 'create'>>({});
  const [attachTarget, setAttachTarget]   = useState<Record<string, string>>({});
  const [newLabel, setNewLabel]           = useState<Record<string, string>>({});
  const [newSlug, setNewSlug]             = useState<Record<string, string>>({});
  const [newUnit, setNewUnit]             = useState<Record<string, string>>({});
  const [newHigher, setNewHigher]         = useState<Record<string, boolean>>({});
  // Filter/search state
  const [filterSearch, setFilterSearch]   = useState('');
  const [filterSport, setFilterSport]     = useState('');
  const [filterCustom, setFilterCustom]   = useState(false);
  // Visible log of AI scoring runs — so scoring is never a silent,
  // instant, unverifiable thing. Each entry tracks its own pending →
  // success/error transition in real time.
  const [scoringLog, setScoringLog] = useState<{
    id: string; athleteName: string; status: 'pending' | 'success' | 'error';
    score?: number; reasoning?: string; error?: string; startedAt: number;
  }[]>([]);
  // Signed URL for whichever row's evidence is currently expanded — only
  // one row is expanded at a time, so a single piece of state is enough
  // (see src/lib/statEvidence.ts for why a resolution step is needed at all).
  const [expandedEvidenceUrl, setExpandedEvidenceUrl] = useState<string | null>(null);

  useEffect(() => {
    const stat = rows.find(r => r.stat.id === expandedId)?.stat;
    if (!stat?.evidence_url) { setExpandedEvidenceUrl(null); return; }
    let cancelled = false;
    setExpandedEvidenceUrl(null);
    resolveStatEvidenceUrl(stat.evidence_url).then(url => {
      if (!cancelled) setExpandedEvidenceUrl(url);
    });
    return () => { cancelled = true; };
  }, [expandedId, rows]);

  const runAIScoring = (statId: string, athleteName: string) => {
    const logId = `${statId}-${Date.now()}`;
    setScoringLog(prev => [{ id: logId, athleteName, status: 'pending', startedAt: Date.now() }, ...prev].slice(0, 10));
    scoreVerifiedStat(statId).then(result => {
      setScoringLog(prev => prev.map(entry => entry.id === logId
        ? result.ok
          ? { ...entry, status: 'success', score: result.score, reasoning: result.reasoning }
          : { ...entry, status: 'error', error: result.error }
        : entry));
    });
  };

  if (!isAdmin) return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;

  const load = async () => {
    setIsLoading(true);
    setError('');
    const [statsRes, profilesRes, eventTypesRes] = await Promise.all([
      supabase.from('athlete_stats').select('*').eq('verification_status', 'pending').order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, username, first_name, last_name, avatar_url, role'),
      supabase.from('stat_event_types').select('*').order('sport').order('label'),
    ]);
    if (statsRes.error) { setError(statsRes.error.message); setIsLoading(false); return; }

    const profileMap: Record<string, Profile> = {};
    for (const p of (profilesRes.data ?? []) as Profile[]) profileMap[p.id] = p;
    const eventMap: Record<string, StatEventType> = {};
    const allET = (eventTypesRes.data ?? []) as StatEventType[];
    for (const e of allET) eventMap[e.id] = e;
    setAllEventTypes(allET);

    const pendingStats = ((statsRes.data ?? []) as AthleteStat[]);
    setRows(pendingStats.map(stat => ({
      stat,
      athlete: profileMap[stat.profile_id] ?? null,
      eventType: stat.stat_event_type_id ? (eventMap[stat.stat_event_type_id] ?? null) : null,
    })));

    const newActions: Record<string, 'attach' | 'create'> = {};
    const newHigherMap: Record<string, boolean> = {};
    for (const stat of pendingStats) {
      if (!stat.stat_event_type_id) {
        newActions[stat.id] = 'attach';
        newHigherMap[stat.id] = (stat as AthleteStat & { custom_higher_is_better?: boolean }).custom_higher_is_better ?? true;
      }
    }
    setCustomAction(prev => ({ ...newActions, ...prev }));
    setNewHigher(prev => ({ ...newHigherMap, ...prev }));
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const performVerify = async (statId: string) => {
    setActioning(statId); setVerifyError(''); setConfirmVerify(null);
    const { error: updateError } = await supabase.from('athlete_stats')
      .update({ verification_status: 'verified' }).eq('id', statId);
    setActioning(null);
    if (updateError) { setVerifyError(`Verify failed: ${updateError.message}`); return; }
    const { data: check } = await supabase.from('athlete_stats').select('id,verification_status').eq('id', statId).single();
    if (!check || (check as { verification_status: string }).verification_status !== 'verified') {
      setVerifyError('Update did not apply — admin UPDATE policy may be missing. Run SQL #80.'); return;
    }
    const athleteName = rows.find(r => r.stat.id === statId)?.athlete ? fullName(rows.find(r => r.stat.id === statId)!.athlete!) : 'athlete';
    setRows(prev => prev.filter(r => r.stat.id !== statId));
    setExpandedId(null);
    runAIScoring(statId, athleteName);
  };

  const performReject = async (statId: string) => {
    const reason = rejectReason[statId]?.trim();
    if (!reason) { setRejectError('A rejection reason is required.'); return; }
    setActioning(statId); setRejectError(''); setConfirmReject(null);
    const { error: updateError } = await supabase.from('athlete_stats')
      .update({ verification_status: 'rejected', rejection_reason: reason }).eq('id', statId);
    setActioning(null);
    if (updateError) { setRejectError(`Reject failed: ${updateError.message}`); return; }
    setRows(prev => prev.filter(r => r.stat.id !== statId));
    setExpandedId(null);
  };

  const attachCustomStat = async (stat: AthleteStat) => {
    const targetId = attachTarget[stat.id];
    if (!targetId) { setVerifyError('Select an event type to attach to.'); return; }
    setActioning(stat.id); setVerifyError(''); setConfirmVerify(null);
    const { error: upErr } = await supabase.from('athlete_stats').update({
      stat_event_type_id: targetId,
      custom_sport: null, custom_event_name: null, custom_unit: null,
      verification_status: 'verified',
    }).eq('id', stat.id);
    setActioning(null);
    if (upErr) { setVerifyError(`Attach failed: ${upErr.message}`); return; }
    const athleteName1 = rows.find(r => r.stat.id === stat.id)?.athlete ? fullName(rows.find(r => r.stat.id === stat.id)!.athlete!) : 'athlete';
    setRows(prev => prev.filter(r => r.stat.id !== stat.id));
    setExpandedId(null);
    runAIScoring(stat.id, athleteName1);
  };

  const createAndAttach = async (stat: AthleteStat) => {
    const sport = stat.custom_sport ?? '';
    const label = newLabel[stat.id]?.trim();
    const slug  = newSlug[stat.id]?.trim() || slugify(label ?? '');
    const unit  = newUnit[stat.id]?.trim() || stat.custom_unit;
    const higher = newHigher[stat.id] ?? true;
    if (!label || !slug || !sport) { setVerifyError('Fill in label, slug, and ensure sport is set.'); return; }
    setActioning(stat.id); setVerifyError(''); setConfirmVerify(null);
    const { data: newET, error: etErr } = await supabase.from('stat_event_types')
      .insert({ sport, event_type: slug, label, unit: unit ?? '', higher_is_better: higher, weight: 1.0 })
      .select('id').single();
    if (etErr) { setActioning(null); setVerifyError(`Create event type failed: ${etErr.message}`); return; }
    const { error: upErr } = await supabase.from('athlete_stats').update({
      stat_event_type_id: (newET as { id: string }).id,
      custom_sport: null, custom_event_name: null, custom_unit: null,
      verification_status: 'verified',
    }).eq('id', stat.id);
    setActioning(null);
    if (upErr) { setVerifyError(`Stat update failed: ${upErr.message}`); return; }
    const athleteName2 = rows.find(r => r.stat.id === stat.id)?.athlete ? fullName(rows.find(r => r.stat.id === stat.id)!.athlete!) : 'athlete';
    setRows(prev => prev.filter(r => r.stat.id !== stat.id));
    setAllEventTypes(prev => [...prev, {
      id: (newET as { id: string }).id, sport, event_type: slug, label,
      unit: unit ?? '', higher_is_better: higher, weight: 1.0, created_at: new Date().toISOString(),
    }]);
    setExpandedId(null);
    runAIScoring(stat.id, athleteName2);
  };

  const allSports = [...new Set(rows.map(r => r.eventType?.sport ?? r.stat.custom_sport).filter(Boolean))] as string[];

  const filteredRows = rows.filter(r => {
    if (filterSport && (r.eventType?.sport ?? r.stat.custom_sport) !== filterSport) return false;
    if (filterCustom && r.stat.stat_event_type_id !== null) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const nameMatch = r.athlete ? (r.athlete.first_name + ' ' + r.athlete.last_name + ' @' + r.athlete.username).toLowerCase().includes(q) : false;
      const eventMatch = (r.eventType?.label ?? r.stat.custom_event_name ?? '').toLowerCase().includes(q);
      if (!nameMatch && !eventMatch) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-sr-bg">
      <AdminTopNav />
      <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="h-7 w-7 text-sr-purple" />
        <h1 className="text-2xl font-bold text-white">Pending Athlete Stats</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">{filteredRows.length} / {rows.length}</span>
      </div>

      {/* AI scoring log — every approval's scoring run shows up here in
          real time (pending -> success/error), so scoring is never a
          silent, unverifiable, instant thing. */}
      {scoringLog.length > 0 && (
        <div className="card-premium p-4 mb-4">
          <h3 className="text-xs font-semibold text-sr-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-sr-purple" />AI Scoring Activity
          </h3>
          <div className="space-y-1.5">
            {scoringLog.map(entry => (
              <div key={entry.id} className="flex items-start gap-2 text-xs">
                {entry.status === 'pending' ? (
                  <Loader2 className="h-3.5 w-3.5 text-sr-purple animate-spin flex-shrink-0 mt-0.5" />
                ) : entry.status === 'success' ? (
                  <Check className="h-3.5 w-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <X className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sr-silver">{entry.athleteName}</span>{' '}
                  {entry.status === 'pending' && <span className="text-sr-text-muted">— AI is evaluating this stat...</span>}
                  {entry.status === 'success' && (
                    <span className="text-green-400">
                      — scored {entry.score?.toFixed(2)}
                      {entry.reasoning && <span className="text-sr-text-muted"> ({entry.reasoning})</span>}
                    </span>
                  )}
                  {entry.status === 'error' && <span className="text-red-400"> — {entry.error}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter controls */}
      <div className="card-premium p-3 mb-4 flex flex-wrap gap-3 items-center">
        <input className="input-dark py-1.5 text-sm flex-1 min-w-[160px]" placeholder="Search athlete or event..."
          value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
        <div className="w-40">
          <Select value={filterSport} onChange={setFilterSport} placeholder="All sports"
            options={allSports.map(s => ({ value: s, label: s }))} className="text-sm" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-sr-silver cursor-pointer select-none">
          <input type="checkbox" checked={filterCustom} onChange={e => setFilterCustom(e.target.checked)} className="accent-sr-purple" />
          Custom events only
        </label>
        {(filterSearch || filterSport || filterCustom) && (
          <button onClick={() => { setFilterSearch(''); setFilterSport(''); setFilterCustom(false); }}
            className="text-xs text-sr-text-muted hover:text-white transition-colors">Clear filters</button>
        )}
      </div>

      {(error || verifyError || rejectError) && (
        <div className="mb-4 space-y-2">
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 flex-shrink-0" />{error}</div>}
          {verifyError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 flex-shrink-0" />{verifyError}</div>}
          {rejectError && <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 flex-shrink-0" />{rejectError}</div>}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : filteredRows.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          {rows.length === 0 ? (
            <>
              <p className="text-white font-semibold mb-1">No Pending Stats</p>
              <p className="text-sm text-sr-text-muted">All athlete stat submissions have been reviewed.</p>
            </>
          ) : (
            <>
              <p className="text-white font-semibold mb-1">No submissions match your filters</p>
              <p className="text-sm text-sr-text-muted">Try clearing the filters to see all {rows.length} pending submission{rows.length !== 1 ? 's' : ''}.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map(({ stat, athlete, eventType }) => {
            const isCustom = !stat.stat_event_type_id;
            const sportForAttach = stat.custom_sport ?? '';
            const eventsForSport = allEventTypes.filter(e => e.sport === sportForAttach);
            const demand = rows.filter(r =>
              !r.stat.stat_event_type_id &&
              r.stat.custom_sport === stat.custom_sport &&
              r.stat.custom_event_name?.toLowerCase() === stat.custom_event_name?.toLowerCase()
            ).length;
            const evidenceIsVideo = isVideo(stat.evidence_url);

            return (
              <div key={stat.id} className="card-premium overflow-hidden">
                {/* Summary row — click to expand */}
                <div className="p-5 flex items-start justify-between gap-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === stat.id ? null : stat.id)}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center flex-shrink-0">
                      {isCustom ? <Sparkles className="h-5 w-5 text-yellow-400" /> : <BarChart3 className="h-5 w-5 text-sr-purple-light" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {isCustom
                          ? <>{stat.custom_event_name} <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 ml-1">Custom</span>{demand > 1 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sr-purple/10 text-sr-purple-light border border-sr-purple/20 ml-1">{demand} submissions</span>}</>
                          : (eventType ? `${eventType.sport} — ${eventType.label}` : 'Unknown event type')}
                      </p>
                      <p className="text-xs text-sr-text-muted">
                        <span className="font-mono text-sr-silver">{stat.value} {isCustom ? stat.custom_unit : eventType?.unit ?? ''}</span>
                        {stat.event_date && ` · ${new Date(stat.event_date).toLocaleDateString()}`}
                        {isCustom && stat.custom_sport && ` · ${formatSportName(stat.custom_sport)}`}
                      </p>
                      <p className="text-xs text-sr-text-muted mt-0.5">
                        {athlete ? `${fullName(athlete)} (@${athlete.username})` : 'unknown'} · {new Date(stat.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">Pending</span>
                    {stat.evidence_url && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sr-surface border border-sr-border text-sr-text-muted flex items-center gap-0.5">
                        {evidenceIsVideo ? <Play className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                        {evidenceIsVideo ? 'Video' : 'Photo'}
                      </span>
                    )}
                    {expandedId === stat.id ? <ChevronUp className="h-4 w-4 text-sr-text-muted" /> : <ChevronDown className="h-4 w-4 text-sr-text-muted" />}
                  </div>
                </div>

                {expandedId === stat.id && (
                  <div className="border-t border-sr-border p-5 space-y-4">
                    {/* Stat details */}
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      {isCustom ? [
                        ['Sport', stat.custom_sport ? formatSportName(stat.custom_sport) : '—'],
                        ['Event / stat', stat.custom_event_name],
                        ['Value', `${stat.value} ${stat.custom_unit ?? ''}`],
                        ['Date', stat.event_date ? new Date(stat.event_date).toLocaleDateString() : '—'],
                      ].map(([l, v]) => (
                        <div key={l as string}><p className="text-xs text-sr-text-muted">{l}</p><p className="text-sr-silver">{v}</p></div>
                      )) : [
                        ['Sport', eventType?.sport],
                        ['Event', eventType?.label],
                        ['Value', `${stat.value} ${eventType?.unit ?? ''}`],
                        ['Date', stat.event_date ? new Date(stat.event_date).toLocaleDateString() : '—'],
                        ['Age group', stat.age_group ?? '—'],
                      ].filter(([, v]) => v).map(([l, v]) => (
                        <div key={l as string}><p className="text-xs text-sr-text-muted">{l}</p><p className="text-sr-silver">{v}</p></div>
                      ))}
                    </div>

                    {/* Evidence — inline preview */}
                    {stat.evidence_url ? (
                      expandedEvidenceUrl ? (
                        <div className="space-y-2">
                          {evidenceIsVideo ? (
                            <video src={expandedEvidenceUrl} controls className="w-full max-h-64 rounded-lg bg-black object-contain"
                              preload="metadata">
                              Your browser does not support inline video.
                            </video>
                          ) : (
                            <img src={expandedEvidenceUrl} alt="Evidence" className="w-full max-h-64 object-contain rounded-lg bg-sr-surface border border-sr-border" />
                          )}
                          <a href={expandedEvidenceUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-sr-purple-light hover:underline">
                            <ExternalLink className="h-3 w-3" /> Open full evidence in new tab
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-sr-text-muted">Loading evidence…</p>
                      )
                    ) : (
                      <p className="text-xs text-orange-400 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" /> No evidence uploaded — consider rejecting.
                      </p>
                    )}

                    {/* Custom stat admin decision */}
                    {isCustom && (
                      <div className="pt-3 border-t border-sr-border space-y-3">
                        <p className="text-xs font-semibold text-sr-silver">Admin Decision — Custom Stat</p>
                        {demand > 1 && (
                          <p className="text-xs text-sr-purple-light">
                            {demand} athletes have submitted "{stat.custom_event_name}" for {formatSportName(sportForAttach || '')} — creating an official event type will cover all of them.
                          </p>
                        )}
                        <div className="flex gap-4">
                          {(['attach', 'create'] as const).map(opt => (
                            <label key={opt} className="flex items-center gap-1.5 text-sm text-sr-silver cursor-pointer">
                              <input type="radio" checked={(customAction[stat.id] ?? 'attach') === opt}
                                onChange={() => setCustomAction(prev => ({ ...prev, [stat.id]: opt }))} className="accent-sr-purple" />
                              {opt === 'attach' ? 'Attach to existing event type' : 'Create new official event type'}
                            </label>
                          ))}
                        </div>

                        {(customAction[stat.id] ?? 'attach') === 'attach' ? (
                          <div>
                            <label className="block text-xs text-sr-text-muted mb-1">Event type for {formatSportName(sportForAttach)}</label>
                            <Select
                              value={attachTarget[stat.id] ?? ''}
                              onChange={v => setAttachTarget(prev => ({ ...prev, [stat.id]: v }))}
                              placeholder={eventsForSport.length === 0 ? 'No events for this sport yet' : '— Select event type —'}
                              disabled={eventsForSport.length === 0}
                              options={eventsForSport.map(et => ({ value: et.id, label: et.label }))}
                              className="text-sm"
                            />
                          </div>
                        ) : (
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-sr-text-muted mb-1">Label</label>
                              <input className="input-dark text-sm w-full" placeholder="e.g. Standing Broad Jump"
                                value={newLabel[stat.id] ?? stat.custom_event_name ?? ''}
                                onChange={e => {
                                  const l = e.target.value;
                                  setNewLabel(p => ({ ...p, [stat.id]: l }));
                                  setNewSlug(p => ({ ...p, [stat.id]: slugify(l) }));
                                }} />
                            </div>
                            <div>
                              <label className="block text-xs text-sr-text-muted mb-1">Slug (auto-generated, editable)</label>
                              <input className="input-dark text-sm w-full font-mono" placeholder="e.g. standing_broad_jump"
                                value={newSlug[stat.id] ?? slugify(stat.custom_event_name ?? '')}
                                onChange={e => setNewSlug(p => ({ ...p, [stat.id]: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-xs text-sr-text-muted mb-1">Unit</label>
                              <input className="input-dark text-sm w-full" placeholder={stat.custom_unit ?? 'e.g. cm'}
                                value={newUnit[stat.id] ?? stat.custom_unit ?? ''}
                                onChange={e => setNewUnit(p => ({ ...p, [stat.id]: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-xs text-sr-text-muted mb-1">Higher is better?</label>
                              <div className="flex gap-3 mt-1">
                                {[true, false].map(v => (
                                  <label key={String(v)} className="flex items-center gap-1.5 text-sm text-sr-silver cursor-pointer">
                                    <input type="radio" checked={(newHigher[stat.id] ?? true) === v}
                                      onChange={() => setNewHigher(p => ({ ...p, [stat.id]: v }))} className="accent-sr-purple" />
                                    {v ? 'Yes' : 'No'}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2">
                          {(customAction[stat.id] ?? 'attach') === 'attach'
                            ? <Button variant="brand" size="sm" disabled={actioning === stat.id || !attachTarget[stat.id]}
                                onClick={() => setConfirmVerify(stat.id)}
                                icon={<Check className="h-4 w-4" />}>
                                Approve &amp; Attach
                              </Button>
                            : <Button variant="brand" size="sm" disabled={actioning === stat.id || !newLabel[stat.id]?.trim()}
                                onClick={() => setConfirmVerify(stat.id)}
                                icon={<Sparkles className="h-4 w-4" />}>
                                Approve &amp; Create Event
                              </Button>
                          }
                          <Button variant="danger" size="sm" disabled={!!actioning}
                            onClick={() => { setRejectError(''); setConfirmReject(stat.id); }}
                            icon={<X className="h-4 w-4" />}>Reject</Button>
                        </div>
                      </div>
                    )}

                    {/* Standard stat approve/reject */}
                    {!isCustom && (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Button variant="brand" size="sm" disabled={actioning === stat.id}
                            onClick={() => setConfirmVerify(stat.id)}
                            icon={actioning === stat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}>
                            Verify Stat
                          </Button>
                          <Button variant="danger" size="sm" disabled={!!actioning}
                            onClick={() => { setRejectError(''); setConfirmReject(stat.id); }}
                            icon={<X className="h-4 w-4" />}>Reject</Button>
                        </div>
                        <p className="text-xs text-sr-text-muted">Verifying triggers automatic score recalculation for all athletes in this sport.</p>
                      </div>
                    )}

                    {/* Rejection reason input — shown when reject is clicked */}
                    {confirmReject === stat.id && (
                      <div className="pt-3 border-t border-sr-border space-y-3">
                        <p className="text-sm font-semibold text-red-400">Rejection reason <span className="text-red-400">*</span></p>
                        <p className="text-xs text-sr-text-muted">This reason is shown to the athlete so they can correct and resubmit.</p>
                        <textarea
                          className="input-dark w-full text-sm min-h-[80px] resize-none"
                          placeholder="e.g. Evidence is unclear — please upload a clearer photo showing your result."
                          value={rejectReason[stat.id] ?? ''}
                          onChange={e => setRejectReason(p => ({ ...p, [stat.id]: e.target.value }))}
                        />
                        {rejectError && <p className="text-xs text-red-400">{rejectError}</p>}
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setConfirmReject(null)} disabled={!!actioning}>Cancel</Button>
                          <Button variant="danger" size="sm" disabled={actioning === stat.id || !(rejectReason[stat.id]?.trim())}
                            onClick={() => performReject(stat.id)}
                            icon={actioning === stat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}>
                            Confirm Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Verify confirmation modal */}
                {confirmVerify === stat.id && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-sr-surface border border-sr-border rounded-2xl p-6 w-full max-w-sm space-y-4">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Check className="h-5 w-5 text-green-400" /> Verify this stat?
                      </h3>
                      <p className="text-sm text-sr-text-muted">
                        Approving will verify the stat, notify the athlete, and recalculate ScoutRank scores for all athletes in this sport.
                      </p>
                      <div className="flex gap-3">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmVerify(null)} disabled={actioning === stat.id}>Cancel</Button>
                        <Button variant="brand" size="sm" disabled={actioning === stat.id}
                          onClick={() => {
                            setConfirmVerify(null);
                            if (isCustom) {
                              (customAction[stat.id] ?? 'attach') === 'attach' ? attachCustomStat(stat) : createAndAttach(stat);
                            } else {
                              performVerify(stat.id);
                            }
                          }}
                          icon={actioning === stat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}>
                          Confirm Verify
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
