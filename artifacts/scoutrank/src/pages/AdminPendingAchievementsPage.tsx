import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { shortDate } from '@/utils/time';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fullName } from '@/lib/supabase';
import { Select } from '@/components/ui/Select';
import type { Profile, Achievement } from '@/lib/supabase';
import { Button } from '@/components/ui/BrandButton';
import { Trophy, Check, X, ExternalLink, Loader2, AlertCircle, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';

interface PendingAchievementRow {
  achievement: Achievement;
  athlete: Profile | null;
}

const ACHIEVEMENT_TYPE_CAPS: Record<string, number> = {
  medal: 100, selection: 80, record: 60, award: 40, milestone: 20, personal_best: 15,
};

const ACHIEVEMENT_TYPES = ['medal', 'selection', 'record', 'award', 'milestone', 'personal_best', 'other'];

export default function AdminPendingAchievementsPage() {
  const { profile: adminProfile, isAdmin } = useAuth();
  const [rows, setRows] = useState<PendingAchievementRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Per-row editable fields for admin to adjust before approving
  const [editPoints, setEditPoints] = useState<Record<string, number>>({});
  const [editType, setEditType] = useState<Record<string, string>>({});

  if (!isAdmin) return <div className="flex items-center justify-center py-20 text-sr-text-muted">Admin access required.</div>;

  const load = async () => {
    setIsLoading(true);
    setError('');
    const [achRes, profilesRes] = await Promise.all([
      supabase.from('achievements').select('*').eq('status', 'pending_review').order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, username, first_name, last_name, avatar_url, role'),
    ]);
    if (achRes.error) { setError(achRes.error.message); setIsLoading(false); return; }

    const profileMap: Record<string, Profile> = {};
    for (const p of (profilesRes.data ?? []) as Profile[]) profileMap[p.id] = p;

    const achievements = (achRes.data ?? []) as Achievement[];
    setRows(achievements.map(a => ({ achievement: a, athlete: profileMap[a.profile_id] ?? null })));

    // Seed editable fields with current DB values
    const pts: Record<string, number> = {};
    const types: Record<string, string> = {};
    for (const a of achievements) {
      pts[a.id]   = a.points_value;
      types[a.id] = a.achievement_type ?? '';
    }
    setEditPoints(pts);
    setEditType(types);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const action = async (achievementId: string, newStatus: 'admin_approved' | 'admin_rejected') => {
    setActioning(achievementId);
    setError('');

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      reviewer_id: adminProfile?.id,
    };
    if (newStatus === 'admin_approved') {
      updatePayload.points_value      = editPoints[achievementId] ?? 0;
      updatePayload.achievement_type  = editType[achievementId] || null;
    }

    const { error: updateError } = await supabase
      .from('achievements')
      .update(updatePayload)
      .eq('id', achievementId);
    setActioning(null);
    if (updateError) { setError(updateError.message); return; }
    load();
    setExpandedId(null);
  };

  const typeCapLabel = (type: string, pts: number) => {
    const cap = ACHIEVEMENT_TYPE_CAPS[type];
    if (!cap) return null;
    if (pts > cap) return `capped at ${cap}`;
    return null;
  };

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    pending_review: { label: 'Pending', cls: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="h-7 w-7 text-sr-purple" />
        <h1 className="text-2xl font-bold text-white">Pending Achievements</h1>
        <span className="text-xs text-sr-text-muted bg-sr-surface border border-sr-border px-2 py-0.5 rounded-full">{rows.length} pending</span>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 flex-shrink-0" />{error}</div>}

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Trophy className="h-12 w-12 mx-auto text-sr-text-muted mb-4" />
          <p className="text-white font-semibold mb-1">No Pending Achievements</p>
          <p className="text-sm text-sr-text-muted">All achievement submissions have been reviewed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ achievement: a, athlete }) => (
            <div key={a.id} className="card-premium overflow-hidden">
              <div className="p-5 flex items-start justify-between gap-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center flex-shrink-0">
                    <Trophy className="h-5 w-5 text-sr-purple-light" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{a.title}</p>
                    <p className="text-xs text-sr-text-muted">{a.sport}{a.achievement_type && ` · ${a.achievement_type}`}</p>
                    <p className="text-xs text-sr-text-muted mt-0.5">
                      Submitted by {athlete ? `${fullName(athlete)} (@${athlete.username})` : 'unknown'}
                      {' · '}{shortDate(a.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_LABEL['pending_review'].cls}`}>
                    {STATUS_LABEL['pending_review'].label}
                  </span>
                  {expandedId === a.id ? <ChevronUp className="h-4 w-4 text-sr-text-muted" /> : <ChevronDown className="h-4 w-4 text-sr-text-muted" />}
                </div>
              </div>

              {expandedId === a.id && (
                <div className="border-t border-sr-border p-5 space-y-4">
                  {/* Read-only details */}
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    {[
                      ['Sport', a.sport],
                      ['Date achieved', a.date_achieved ? shortDate(a.date_achieved) : '—'],
                      ['Claimed points', String(a.points_value)],
                      ['Current type', a.achievement_type ?? '—'],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <p className="text-xs text-sr-text-muted">{label}</p>
                        <p className="text-sr-silver">{value}</p>
                      </div>
                    ))}
                  </div>
                  {a.description && (
                    <div>
                      <p className="text-xs text-sr-text-muted mb-1">Description</p>
                      <p className="text-sm text-sr-silver bg-sr-surface rounded-lg p-3">{a.description}</p>
                    </div>
                  )}
                  {a.evidence_url && (
                    <a href={a.evidence_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-sr-purple-light hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> View Evidence
                    </a>
                  )}

                  {/* Admin-editable fields */}
                  <div className="pt-2 border-t border-sr-border space-y-3">
                    <p className="text-xs font-semibold text-sr-silver">Admin Review</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-sr-text-muted mb-1">
                          Achievement Type <span className="text-red-400">*</span>
                        </label>
                        <Select
                          value={editType[a.id] ?? ''}
                          onChange={v => setEditType(prev => ({ ...prev, [a.id]: v }))}
                          placeholder="— Select type —"
                          options={ACHIEVEMENT_TYPES.map(t => ({ value: t, label: t }))}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-sr-text-muted mb-1">
                          Points Value
                          {editType[a.id] && ACHIEVEMENT_TYPE_CAPS[editType[a.id]] && (
                            <span className="ml-1 text-sr-text-muted">(cap: {ACHIEVEMENT_TYPE_CAPS[editType[a.id]]})</span>
                          )}
                        </label>
                        <input type="number" min={0} max={500}
                          className="input-dark text-sm w-full"
                          value={editPoints[a.id] ?? 0}
                          onChange={e => setEditPoints(prev => ({ ...prev, [a.id]: parseInt(e.target.value) || 0 }))} />
                        {editType[a.id] && typeCapLabel(editType[a.id], editPoints[a.id] ?? 0) && (
                          <p className="text-xs text-yellow-400 mt-1">Will be {typeCapLabel(editType[a.id], editPoints[a.id] ?? 0)} by scoring engine</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="brand" size="sm"
                      disabled={actioning === a.id || !editType[a.id] || editType[a.id] === 'other'}
                      onClick={() => action(a.id, 'admin_approved')}
                      icon={actioning === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      title={!editType[a.id] ? 'Select an achievement type first' : ''}>
                      Approve
                    </Button>
                    <Button variant="danger" size="sm" disabled={!!actioning}
                      onClick={() => action(a.id, 'admin_rejected')}
                      icon={<X className="h-4 w-4" />}>
                      Reject
                    </Button>
                  </div>
                  {!editType[a.id] && (
                    <p className="text-xs text-yellow-400">Select an achievement type before approving — required by the scoring engine.</p>
                  )}
                  <p className="text-xs text-sr-text-muted">
                    Approving will trigger automatic score recalculation for this athlete's sport.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
