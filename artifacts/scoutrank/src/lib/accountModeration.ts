import { supabase } from '@/lib/supabase';

/**
 * A plain <input type="date"> value like "2026-08-01" parses to midnight
 * UTC at the *start* of that day — which, combined with the auto-expiry
 * check in AuthContext, meant a suspension "until today" was treated as
 * already expired the moment anyone's session was checked, silently
 * reverting it back to active. Using the end of that day instead means
 * "suspended until August 1st" actually covers the whole day.
 */
export function endOfDayISOString(dateOnly: string): string {
  return new Date(`${dateOnly}T23:59:59.999`).toISOString();
}

export type ModerationAction = 'suspend' | 'ban' | 'restrict';

/**
 * A lighter-touch action than suspend/ban, modeled on Instagram's
 * "restrict": the account stays fully active and can keep using the app
 * normally, but for exactly 7 days, their posts, comments, and follower
 * list become invisible to everyone except themselves — enforced by RLS
 * on posts/post_comments/follows, so it applies everywhere automatically
 * rather than needing every query in the app patched individually.
 * Unlike Instagram's version, the person IS told (a visible notice).
 */
export async function applyRestriction(params: {
  performedBy: string;
  targetUserId: string;
  reason: string;
}): Promise<ModerationResult> {
  const restrictedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error, data } = await supabase.from('profiles').update({
    account_status: 'restricted',
    status_reason: params.reason,
    restricted_until: restrictedUntil,
    status_changed_by: params.performedBy,
    status_changed_at: new Date().toISOString(),
  }).eq('id', params.targetUserId).select('id');

  if (error) return { ok: false, error: `Failed to restrict: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, error: 'Update did not apply — no row was changed.' };

  const { error: logErr } = await supabase.from('account_moderation_log').insert({
    profile_id: params.targetUserId,
    action: 'restricted',
    reason: params.reason,
    suspended_until: restrictedUntil,
    performed_by: params.performedBy,
  });
  if (logErr) return { ok: false, error: `Restricted, but failed to log it: ${logErr.message}` };

  // Reuses the existing warning pop-up — the person is told plainly,
  // same visible-notice pattern as a warning.
  const { error: noticeErr } = await supabase.from('account_warnings').insert({
    profile_id: params.targetUserId,
    reason: `Your account has been restricted for 7 days: ${params.reason}. During this time, your posts, comments, and followers are hidden from everyone else — you can keep using the app normally otherwise.`,
    issued_by: params.performedBy,
  });
  if (noticeErr) return { ok: false, error: `Restricted, but failed to notify the owner: ${noticeErr.message}` };

  return { ok: true };
}

export interface ModerationResult {
  ok: boolean;
  error?: string;
}

/**
 * Suspends or bans an account — the exact same effect as the Users tab's
 * suspend/ban actions (reason, evidence, and an end date for suspensions
 * only), so this can be reused wherever an admin needs to act on an
 * account, not just from the Users list.
 */
export async function applyAccountModeration(params: {
  performedBy: string;
  targetUserId: string;
  action: ModerationAction;
  reason: string;
  until?: string | null; // ISO date string, suspend only
  evidenceUrl?: string | null;
}): Promise<ModerationResult> {
  const status = params.action === 'suspend' ? 'suspended' : 'banned';
  const until = params.action === 'suspend' ? (params.until ?? null) : null;

  const { error, data } = await supabase.from('profiles').update({
    account_status: status,
    status_reason: params.reason,
    suspended_until: until,
    status_changed_by: params.performedBy,
    status_changed_at: new Date().toISOString(),
    status_evidence_url: params.evidenceUrl ?? null,
  }).eq('id', params.targetUserId).select('id');

  if (error) return { ok: false, error: `Failed to update status: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, error: 'Update did not apply — no row was changed. Check the admin UPDATE policy on profiles.' };

  const { error: logErr } = await supabase.from('account_moderation_log').insert({
    profile_id: params.targetUserId,
    action: status,
    reason: params.reason,
    suspended_until: until,
    performed_by: params.performedBy,
    evidence_url: params.evidenceUrl ?? null,
  });
  if (logErr) return { ok: false, error: `Status updated, but failed to log it: ${logErr.message}` };

  return { ok: true };
}

/** A lighter-touch action than suspend/ban — just a notice the account holder sees next time they open the app. */
export async function issueWarning(params: {
  performedBy: string;
  targetUserId: string;
  reason: string;
}): Promise<ModerationResult> {
  const { error } = await supabase.from('account_warnings').insert({
    profile_id: params.targetUserId,
    reason: params.reason,
    issued_by: params.performedBy,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
