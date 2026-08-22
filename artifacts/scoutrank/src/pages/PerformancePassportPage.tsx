import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, fullName } from '@/lib/supabase';
import type { Profile, AthleteDetail, AthleteStat, StatEventType, Achievement, Post } from '@/lib/supabase';
import { shortDate } from '@/utils/time';
import { ArrowLeft, Loader2, Award, Video, TrendingUp, Users, GraduationCap, HeartPulse, Printer, QrCode } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { computeDNAScores, DNA_ATTRIBUTES, type DNAScore } from '@/lib/athleteDNA';

// A stable, permanent-looking reference number — not stored separately,
// just a formatted view of the profile's own ID so it's consistent and
// requires no new schema.
function athleteId(profileId: string): string {
  return `SR-${profileId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/**
 * A unified sporting résumé — pulling together data that already lives
 * scattered across posts, stats, and achievements into one shareable
 * view, rather than making a scout or coach dig through separate tabs.
 * Read-only, respects the same visibility as the athlete's normal
 * profile (no separate access rules — if you can see their profile, you
 * can see this).
 */
export default function PerformancePassportPage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [detail, setDetail] = useState<AthleteDetail | null>(null);
  const [stats, setStats] = useState<(AthleteStat & { stat_event_types: StatEventType | null })[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [highlights, setHighlights] = useState<Post[]>([]);
  const [dnaScores, setDnaScores] = useState<DNAScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!username) return;
    (async () => {
      setIsLoading(true);
      setError('');
      const { data: p, error: pErr } = await supabase.from('profiles').select('*').eq('username', username).maybeSingle();
      if (pErr || !p) { setError('Athlete not found.'); setIsLoading(false); return; }
      setProfile(p as Profile);

      const [detailRes, statsRes, achievementsRes, highlightsRes] = await Promise.all([
        supabase.from('athlete_details').select('*').eq('profile_id', p.id).maybeSingle(),
        supabase.from('athlete_stats').select('*, stat_event_types(*)').eq('profile_id', p.id).eq('verification_status', 'verified').order('event_date', { ascending: false }),
        supabase.from('achievements').select('*').eq('profile_id', p.id).in('status', ['ai_approved', 'admin_approved']).order('date_achieved', { ascending: false }),
        supabase.from('posts').select('*').eq('profile_id', p.id).eq('post_type', 'highlight').order('created_at', { ascending: false }).limit(12),
      ]);

      setDetail((detailRes.data as AthleteDetail | null) ?? null);
      setStats((statsRes.data as (AthleteStat & { stat_event_types: StatEventType | null })[] | null) ?? []);
      setAchievements((achievementsRes.data as Achievement[] | null) ?? []);
      setHighlights((highlightsRes.data as Post[] | null) ?? []);
      setIsLoading(false);

      computeDNAScores(p.id, (p as Profile).dna_self_reported).then(setDnaScores);
    })();
  }, [username]);

  // Personal bests — the single best verified result per event, respecting
  // whether higher or lower is better for that event (e.g. sprint times
  // want lower, jump distances want higher).
  const personalBests = (() => {
    const byEvent: Record<string, AthleteStat & { stat_event_types: StatEventType | null }> = {};
    for (const s of stats) {
      const key = s.stat_event_type_id ?? `${s.custom_event_name}`;
      const existing = byEvent[key];
      if (!existing) { byEvent[key] = s; continue; }
      const higherIsBetter = s.stat_event_types?.higher_is_better ?? true;
      const better = higherIsBetter ? s.value > existing.value : s.value < existing.value;
      if (better) byEvent[key] = s;
    }
    return Object.values(byEvent);
  })();

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 text-sr-purple animate-spin" /></div>;
  }
  if (error || !profile) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-center text-sr-text-muted">{error || 'Not found.'}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 print:py-0">
      <style>{`
        @page { margin: 0; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          html, body, #root, .bg-sr-bg { background: #0B0E1A !important; margin: 0 !important; padding: 0 !important; }
        }
      `}</style>
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Link to={`/profile/${username}`} className="inline-flex items-center gap-1.5 text-xs text-sr-text-muted hover:text-white transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Profile
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowQr(v => !v)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30">
            <QrCode className="h-3.5 w-3.5" /> QR Code
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-silver hover:border-sr-purple/30">
            <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
          </button>
        </div>
      </div>

      {showQr && (
        <div className="card-premium p-6 mb-6 flex flex-col items-center print:hidden">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.href)}`}
            alt="QR code to this Performance Passport" className="rounded-lg mb-2" width={200} height={200} />
          <p className="text-xs text-sr-text-muted">Scan to open this Performance Passport directly.</p>
        </div>
      )}

      {/* Header */}
      <div className="card-premium p-6 mb-6 flex items-center gap-4">
        <div className="h-20 w-20 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center text-xl font-bold text-white">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">{fullName(profile)}</h1>
          <p className="text-sm text-sr-text-muted">@{profile.username} &middot; {[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}</p>
          <p className="text-xs text-sr-text-muted mt-0.5 font-mono">{athleteId(profile.id)}</p>
          {detail && (
            <p className="text-sm text-sr-silver mt-1">
              {detail.primary_sport}{detail.position ? ` — ${detail.position}` : ''}{detail.club ? ` @ ${detail.club}` : ''}
            </p>
          )}
        </div>
        {profile.scoutrank_score !== null && (
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-sr-purple-light">{profile.scoutrank_score?.toFixed(2)}</p>
            <p className="text-[10px] text-sr-text-muted uppercase tracking-wide">ScoutRank</p>
          </div>
        )}
      </div>

      {profile.bio && <p className="text-sm text-sr-silver mb-6">{profile.bio}</p>}

      {/* Performance Trends — one chart per event with enough history to
          actually show a trend, rather than a flat single-point chart */}
      {(() => {
        const byEvent: Record<string, { label: string; unit: string; points: { date: string; value: number }[] }> = {};
        for (const s of stats) {
          const key = s.stat_event_type_id ?? `custom:${s.custom_event_name}`;
          const label = s.stat_event_types?.label ?? s.custom_event_name ?? 'Event';
          const unit = s.stat_event_types?.unit ?? s.custom_unit ?? '';
          if (!byEvent[key]) byEvent[key] = { label, unit, points: [] };
          byEvent[key].points.push({ date: s.event_date, value: s.value });
        }
        const trends = Object.values(byEvent).filter(e => e.points.length >= 2).map(e => ({ ...e, points: [...e.points].sort((a, b) => a.date.localeCompare(b.date)) }));
        if (trends.length === 0) return null;
        return (
          <section className="mb-6" style={{ breakInside: 'avoid' }}>
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-sr-purple-light" /> Performance Trends</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {trends.map(t => (
                <div key={t.label} className="card-premium p-3">
                  <p className="text-xs text-sr-text-muted mb-2">{t.label} {t.unit ? `(${t.unit})` : ''}</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={t.points}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2A2F45" />
                      <XAxis dataKey="date" tickFormatter={d => shortDate(d)} tick={{ fontSize: 10, fill: '#8B8FA8' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#8B8FA8' }} width={32} />
                      <Tooltip labelFormatter={d => shortDate(d as string)} contentStyle={{ background: '#131730', border: '1px solid #2A2F45', borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="value" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Personal Bests */}
      {personalBests.length > 0 && (
        <section className="mb-6" style={{ breakInside: 'avoid' }}>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-sr-purple-light" /> Personal Bests</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {personalBests.map(s => (
              <div key={s.id} className="card-premium p-3">
                <p className="text-xs text-sr-text-muted">{s.stat_event_types?.label ?? s.custom_event_name}</p>
                <p className="text-lg font-bold text-white">{s.value}{s.stat_event_types?.unit ? ` ${s.stat_event_types.unit}` : s.custom_unit ? ` ${s.custom_unit}` : ''}</p>
                <p className="text-[10px] text-sr-text-muted">{shortDate(s.event_date)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Athlete DNA Profile — derived from verified stats where a
          matching event exists (a real percentile against everyone else
          with data for that event), self-reported to fill any gaps. */}
      {dnaScores.some(d => d.score !== null) && (
        <section className="mb-6" style={{ breakInside: 'avoid' }}>
          <h2 className="text-sm font-semibold text-white mb-3">Athlete DNA Profile</h2>
          <div className="card-premium p-4 mb-3">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={DNA_ATTRIBUTES.map(a => ({ label: a.label, value: dnaScores.find(d => d.attribute === a.key)?.score ?? 0 }))}>
                <PolarGrid stroke="#2A2F45" />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B8FA8' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#8B8FA8' }} tickCount={3} />
                <Radar dataKey="value" stroke="#8A3FFC" fill="#8A3FFC" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DNA_ATTRIBUTES.map(a => {
              const d = dnaScores.find(x => x.attribute === a.key);
              return (
                <div key={a.key} className="card-premium p-3">
                  <p className="text-xs text-sr-text-muted">{a.label}</p>
                  <p className="text-lg font-bold text-white">{d?.score ?? '—'}{d?.score !== null && d?.score !== undefined ? '/100' : ''}</p>
                  <p className="text-[10px] text-sr-text-muted">
                    {d?.source === 'derived' ? `Derived — ${d.evidence}` : d?.source === 'self-reported' ? 'Self-reported' : 'No data yet'}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Competition Results */}
      {stats.length > 0 && (
        <section className="mb-6" style={{ breakInside: 'avoid' }}>
          <h2 className="text-sm font-semibold text-white mb-3">Competition Results ({stats.length})</h2>
          <div className="card-premium divide-y divide-sr-border">
            {stats.map(s => (
              <div key={s.id} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <p className="text-white">{s.stat_event_types?.label ?? s.custom_event_name}</p>
                  <p className="text-xs text-sr-text-muted">{shortDate(s.event_date)}{s.competition_level ? ` · ${s.competition_level}` : ''}</p>
                </div>
                <p className="font-semibold text-sr-purple-light">{s.value}{s.stat_event_types?.unit ? ` ${s.stat_event_types.unit}` : s.custom_unit ? ` ${s.custom_unit}` : ''}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Video Highlights — hidden entirely for print, not just the grid;
          videos can't render on a printed page, and hiding only the grid
          left an orphaned heading with nothing beneath it. */}
      {highlights.length > 0 && (
        <section className="mb-6 print:hidden">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5"><Video className="h-4 w-4 text-sr-purple-light" /> Video Highlights</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {highlights.map(h => (
              <div key={h.id} className="rounded-lg overflow-hidden bg-black aspect-[9/16]">
                {h.media_url && <video src={h.media_url} controls className="w-full h-full object-cover" />}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Awards & Achievements */}
      {achievements.length > 0 && (
        <section className="mb-6" style={{ breakInside: 'avoid' }}>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5"><Award className="h-4 w-4 text-sr-purple-light" /> Awards & Achievements</h2>
          <div className="space-y-2">
            {achievements.map(a => (
              <div key={a.id} className="card-premium p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{a.title}</p>
                  {a.date_achieved && <span className="text-xs text-sr-text-muted">{shortDate(a.date_achieved)}</span>}
                </div>
                {a.description && <p className="text-xs text-sr-text-muted mt-0.5">{a.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Team History */}
      {detail?.club && (
        <section className="mb-6" style={{ breakInside: 'avoid' }}>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5"><Users className="h-4 w-4 text-sr-purple-light" /> Team History</h2>
          <div className="card-premium p-3 text-sm text-sr-silver">{detail.club}</div>
        </section>
      )}

      {/* Academic Info — optional, only shown if the athlete filled it in */}
      {profile.academic_info && (
        <section className="mb-6" style={{ breakInside: 'avoid' }}>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5"><GraduationCap className="h-4 w-4 text-sr-purple-light" /> Academic Information</h2>
          <div className="card-premium p-3 text-sm text-sr-silver whitespace-pre-wrap">{profile.academic_info}</div>
        </section>
      )}

      {/* Injury History — optional, only shown if the athlete filled it in */}
      {profile.injury_history && (
        <section className="mb-6" style={{ breakInside: 'avoid' }}>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5"><HeartPulse className="h-4 w-4 text-sr-purple-light" /> Injury History</h2>
          <div className="card-premium p-3 text-sm text-sr-silver whitespace-pre-wrap">{profile.injury_history}</div>
        </section>
      )}

      {personalBests.length === 0 && stats.length === 0 && highlights.length === 0 && achievements.length === 0 && !dnaScores.some(d => d.score !== null) && (
        <p className="text-sm text-sr-text-muted text-center py-12">Nothing to show yet — verified stats, highlights, and achievements will appear here once added.</p>
      )}
    </div>
  );
}
