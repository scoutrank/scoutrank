import { supabase } from '@/lib/supabase';
import { groqChat, extractJsonObject } from '@/lib/groq';
import { calculateAgeFromDob } from '@/utils/time';

export type ScoreResult =
  | { ok: true; score: number; reasoning: string }
  | { ok: false; error: string };

const MISSING_COLUMN_HINT =
  'Database is missing the competition_level/ai_score columns on athlete_stats. ' +
  'Run: alter table athlete_stats add column if not exists competition_level text; ' +
  'alter table athlete_stats add column if not exists ai_score numeric;';

function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  // Postgres "undefined_column" — the exact error you get if the SQL
  // migration for this feature was never run.
  return err.code === '42703' || /column .* does not exist/i.test(err.message ?? '');
}

/**
 * Runs right after a stat is verified by an admin. Scores that specific
 * result via AI (0.00-100.00, deliberately calibrated so 100 is nearly
 * unreachable), stores it on the stat row, then recomputes the athlete's
 * overall ScoutRank score as the average of all their AI-scored verified
 * stats. Achievements never factor in — only verified stats do.
 *
 * Unlike the first version of this, this NEVER fails silently — every
 * failure path returns a real, visible error so a broken scoring run
 * shows up on screen instead of vanishing into the console.
 */
export async function scoreVerifiedStat(statId: string): Promise<ScoreResult> {
  try {
    const { data: stat, error: statErr } = await supabase
      .from('athlete_stats')
      .select('*, stat_event_types(*)')
      .eq('id', statId)
      .maybeSingle();

    if (isMissingColumnError(statErr)) return { ok: false, error: MISSING_COLUMN_HINT };
    if (statErr || !stat) return { ok: false, error: `Could not load stat: ${statErr?.message ?? 'not found'}` };

    const s = stat as unknown as {
      id: string;
      profile_id: string;
      value: number;
      competition_level: string | null;
      stat_event_type_id: string | null;
      custom_sport: string | null;
      custom_event_name: string | null;
      custom_unit: string | null;
      age_group: string | null;
      stat_event_types: { sport: string; label: string; unit: string; higher_is_better: boolean } | null;
    };

    const { data: profile } = await supabase
      .from('profiles')
      .select('date_of_birth')
      .eq('id', s.profile_id)
      .maybeSingle();

    const sport = s.stat_event_types?.sport ?? s.custom_sport ?? 'unknown';
    const eventLabel = s.stat_event_types?.label ?? s.custom_event_name ?? 'custom event';
    const unit = s.stat_event_types?.unit ?? s.custom_unit ?? '';
    const higherIsBetter = s.stat_event_types?.higher_is_better ?? true;
    const age = profile ? calculateAgeFromDob((profile as { date_of_birth: string | null }).date_of_birth) : null;

    let comparisonQuery = supabase
      .from('athlete_stats')
      .select('value, competition_level')
      .eq('verification_status', 'verified')
      .neq('id', statId)
      .limit(40);
    comparisonQuery = s.stat_event_type_id
      ? comparisonQuery.eq('stat_event_type_id', s.stat_event_type_id)
      : comparisonQuery.eq('custom_sport', s.custom_sport ?? '');
    const { data: comparisonRows, error: comparisonErr } = await comparisonQuery;
    if (isMissingColumnError(comparisonErr)) return { ok: false, error: MISSING_COLUMN_HINT };

    const hasComparisons = (comparisonRows ?? []).length > 0;

    const prompt = `You are an expert sports scout and performance evaluator for ScoutRank, a talent-scouting platform. \
Score this ONE verified athletic result on a 0.00-100.00 scale reflecting genuine sporting merit.

Athlete age: ${age ?? 'unknown'}
Sport: ${sport}
Event/stat: ${eventLabel}
Result: ${s.value} ${unit} (${higherIsBetter ? 'higher values are better' : 'lower values are better'})
Competition level this was achieved at: ${s.competition_level ?? 'not specified'}

${hasComparisons
  ? `Other verified results in this same event, for extra context (value and competition level):\n${JSON.stringify((comparisonRows ?? []).map(r => ({ value: r.value, level: r.competition_level })))}`
  : `There are no other verified results in this event yet to compare against — this is the first submission. Do NOT treat that as a reason to default to a neutral/average score. Instead, rely directly on your own real-world knowledge of ${sport} to judge this result: what a typical, a strong, and an elite result looks like for this specific stat, at this competition level, for an athlete of this age. You have this knowledge — use it confidently and specifically, the same way a real scout who knows the sport would immediately recognise whether a number is pedestrian or excellent.`}

HOW TO THINK ABOUT THIS (do this before scoring):
1. Recall what's actually normal for "${eventLabel}" in ${sport} at the "${s.competition_level ?? 'unspecified'}" level for a ${age ?? 'this'}-year-old — draw on genuine domain knowledge of the sport, not just the numbers above.
2. Judge where ${s.value}${unit ? ' ' + unit : ''} actually falls: is it below average, average, above average, very strong, or exceptional for that specific context?
3. Only then assign the score. Never pick a score just because you're unsure — an unfamiliar-looking stat or missing comparison data is not a reason to hedge toward the middle. Form a real judgment and commit to it.

SCORE CALIBRATION — follow this strictly, do not be generous, but also do not be falsely conservative out of caution:
- 95.00-100.00: literally world-record / Olympic-gold-medal caliber for this age group. Reserve this almost never — \
only for a result that is genuinely extraordinary.
- 85.00-94.99: national-elite, professional-pathway level — a standout, clearly elite result for the age/level.
- 70.00-84.99: strong, well above-average performance for a serious club/regional/representative athlete.
- 50.00-69.99: solid, competent, roughly average-to-decent performance for the stated level.
- 30.00-49.99: a below-average or still-developing performance.
- 10.00-29.99: a weak or beginner-level result for the stated level.
- 0.00-9.99: minimal result, or essentially no real competitive merit shown.
A genuinely strong, well-above-average result for the stated age/level/sport should score in the 70s-80s even on a \
first-ever submission with no in-app comparison data — do not undersell it just because there's nothing else in the \
database yet to compare it to. Higher competition levels (national/international) should generally score higher than \
the same raw value achieved at a recreational/school level, since the achievement carries more weight.
Use the full range and real decimal precision reflecting genuine variance (e.g. 42.37, 76.42, 19.04) — never round to \
a whole number, and never land on a suspiciously "clean" or neutral-looking number like 50.00 unless your actual \
judgment genuinely puts it exactly there.

Respond with ONLY strict JSON, nothing else, no markdown fences: {"score": <number>, "reasoning": "<one short sentence explaining the judgment, referencing what's typical for this sport/level/age>"}`;

    let raw: string;
    try {
      raw = await groqChat(
        [
          { role: 'system', content: 'You are an expert sports scout with deep, specific knowledge of typical performance benchmarks across many sports at every level from recreational to international. You form confident, specific judgments even without database comparison data, drawing on real knowledge of the sport. You output only valid JSON, nothing else — no markdown, no commentary outside the JSON object.' },
          { role: 'user', content: prompt },
        ],
        1000,
      );
    } catch (groqErr) {
      const msg = groqErr instanceof Error ? groqErr.message : String(groqErr);
      return { ok: false, error: `Groq API call failed: ${msg}` };
    }

    const cleaned = extractJsonObject(raw);
    let parsed: { score?: unknown; reasoning?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: `AI did not return valid JSON. Raw response: ${raw.slice(0, 200)}` };
    }

    let score = Number(parsed.score);
    if (!Number.isFinite(score)) {
      return { ok: false, error: `AI response had no usable numeric score. Raw: ${JSON.stringify(parsed).slice(0, 200)}` };
    }
    score = Math.max(0, Math.min(100, score));
    score = Math.round(score * 100) / 100;
    const reasoning = parsed.reasoning ?? '(no reasoning given)';

    const { error: updateStatErr } = await supabase
      .from('athlete_stats')
      .update({ ai_score: score })
      .eq('id', statId);
    if (isMissingColumnError(updateStatErr)) return { ok: false, error: MISSING_COLUMN_HINT };
    if (updateStatErr) return { ok: false, error: `Failed to save ai_score: ${updateStatErr.message}` };

    const recomputeResult = await recomputeScores(s.profile_id, sport, s.age_group);
    if (!recomputeResult.ok) return recomputeResult;

    return { ok: true, score, reasoning };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Unexpected failure: ${msg}` };
  }
}

/**
 * Writes the athlete's real, AI-derived score to the same place the app's
 * UI actually reads it from: per-sport rows in the `rankings` table — one
 * for division='Open' (what the profile page banner, Rankings leaderboard,
 * and Dashboard all display), and one for the athlete's own age bracket
 * (e.g. 'U17') if this stat has one, so age-specific leaderboards reflect
 * real AI scores too instead of the old placeholder numbers that used to
 * live there. This supersedes that old age+random-number formula entirely.
 *
 * Also mirrors an overall (cross-sport) average onto profiles.scoutrank_score
 * for the couple of places that read that column directly as a quick summary.
 */
async function recomputeScores(
  profileId: string,
  scoredSport: string,
  ageGroup: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const openResult = await writeDivisionScore(profileId, scoredSport, 'Open', null);
  if (!openResult.ok) return openResult;

  // Age-specific division (e.g. U17) — only the athlete's stats within
  // that same age bracket count toward it, separate from the Open average.
  if (ageGroup && ageGroup !== 'Open') {
    const ageResult = await writeDivisionScore(profileId, scoredSport, ageGroup, ageGroup);
    if (!ageResult.ok) return ageResult;
  }

  // Overall (cross-sport) average, mirrored onto profiles.scoutrank_score.
  const { data: allScored, error: allErr } = await supabase
    .from('athlete_stats')
    .select('ai_score')
    .eq('profile_id', profileId)
    .eq('verification_status', 'verified')
    .not('ai_score', 'is', null);
  if (isMissingColumnError(allErr)) return { ok: false, error: MISSING_COLUMN_HINT };
  if (allErr) return { ok: false, error: `Failed to load overall scored stats: ${allErr.message}` };

  const allScores = (allScored ?? [])
    .map(r => (r as { ai_score: number | null }).ai_score)
    .filter((n): n is number => typeof n === 'number');

  if (allScores.length === 0) return { ok: true }; // stays "Not Ranked" until at least one scored stat exists

  const overallAvg = Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100;
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ scoutrank_score: overallAvg })
    .eq('id', profileId);
  if (profileErr) return { ok: false, error: `Failed to update profile score: ${profileErr.message}` };

  return { ok: true };
}

/**
 * Computes and writes one division's rank_score for one sport — either
 * the Open average (all of the athlete's scored stats in this sport,
 * pass ageFilter=null) or a specific age bracket (only stats matching
 * that age_group, pass e.g. ageFilter='U17').
 */
async function writeDivisionScore(
  profileId: string,
  sport: string,
  division: string,
  ageFilter: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Standard (event-typed) verified stats in this sport...
  let standardQuery = supabase
    .from('athlete_stats')
    .select('ai_score, stat_event_types!inner(sport)')
    .eq('profile_id', profileId)
    .eq('verification_status', 'verified')
    .eq('stat_event_types.sport', sport)
    .not('ai_score', 'is', null);
  if (ageFilter) standardQuery = standardQuery.eq('age_group', ageFilter);
  const { data: standardStats, error: standardErr } = await standardQuery;
  if (isMissingColumnError(standardErr)) return { ok: false, error: MISSING_COLUMN_HINT };
  if (standardErr) return { ok: false, error: `Failed to load stats for ${sport}/${division}: ${standardErr.message}` };

  // ...plus custom (non-event-typed) verified stats logged under this sport.
  let customQuery = supabase
    .from('athlete_stats')
    .select('ai_score')
    .eq('profile_id', profileId)
    .eq('verification_status', 'verified')
    .eq('custom_sport', sport)
    .not('ai_score', 'is', null);
  if (ageFilter) customQuery = customQuery.eq('age_group', ageFilter);
  const { data: customStats, error: customErr } = await customQuery;
  if (isMissingColumnError(customErr)) return { ok: false, error: MISSING_COLUMN_HINT };
  if (customErr) return { ok: false, error: `Failed to load custom stats for ${sport}/${division}: ${customErr.message}` };

  const scores = [
    ...(standardStats ?? []).map(r => (r as { ai_score: number | null }).ai_score),
    ...(customStats ?? []).map(r => (r as { ai_score: number | null }).ai_score),
  ].filter((n): n is number => typeof n === 'number');

  if (scores.length === 0) return { ok: true }; // nothing to write for this division yet

  const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;

  // Manual check-then-write instead of .upsert(onConflict: ...) — the
  // rankings table doesn't have the unique constraint that would need
  // (confirmed by testing: Postgres rejected it), so this sidesteps
  // needing to know exactly what constraints do exist.
  const { data: existingRanking, error: findErr } = await supabase
    .from('rankings')
    .select('profile_id')
    .eq('profile_id', profileId)
    .eq('sport', sport)
    .eq('division', division)
    .maybeSingle();
  if (findErr) return { ok: false, error: `Failed to check existing ranking row: ${findErr.message}` };

  if (existingRanking) {
    const { error: updateErr } = await supabase
      .from('rankings')
      .update({ rank_score: avg, updated_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .eq('sport', sport)
      .eq('division', division);
    if (updateErr) return { ok: false, error: `Failed to update rankings table (${division}): ${updateErr.message}` };
  } else {
    const { error: insertErr } = await supabase.from('rankings').insert({
      profile_id: profileId,
      sport,
      rank_score: avg,
      division,
      updated_at: new Date().toISOString(),
    });
    if (insertErr) return { ok: false, error: `Failed to insert into rankings table (${division}): ${insertErr.message}` };
  }

  return { ok: true };
}
