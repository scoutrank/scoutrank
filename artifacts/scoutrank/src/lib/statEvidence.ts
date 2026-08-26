// Helpers for the stat-evidence storage bucket, which is being moved from
// permanent public URLs to short-lived signed URLs (the bucket itself will
// be flipped to private in the Supabase dashboard once this ships).
//
// Two value formats can show up in athlete_stats.evidence_url:
//   - legacy rows written before this change: a full public URL like
//     https://<project>.supabase.co/storage/v1/object/public/stat-evidence/<path>
//   - new rows written after this change (see AthleteProfilePage's
//     handleEvidenceUpload): just the bare storage path, e.g.
//     "<profileId>/<timestamp>.jpg"
//
// Every place that reads evidence_url needs to handle both, so that logic
// lives here once instead of being copy-pasted at each render site.
import { supabase } from '@/lib/supabase';

const BUCKET = 'stat-evidence';
const MARKER = `/${BUCKET}/`;

/** Normalizes either a legacy full public URL or a bare path into just the storage path. Returns null for empty/unrecognized values. */
export function statEvidencePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const idx = value.indexOf(MARKER);
  if (idx !== -1) return value.slice(idx + MARKER.length);
  // No bucket marker and no URL scheme — already a bare path (new-format rows).
  if (!/^https?:\/\//i.test(value)) return value;
  // Some other unrecognized URL shape — nothing usable here.
  return null;
}

/**
 * Resolves a stat-evidence value (legacy public URL or bare path) into a
 * fresh signed URL for display or fetching. Returns null if there's
 * nothing to show, or if signing fails — callers should treat that as "no
 * evidence available right now" rather than throwing, since a transient
 * signing hiccup shouldn't break an otherwise-working page.
 */
export async function resolveStatEvidenceUrl(
  value: string | null | undefined,
  expirySeconds = 300,
): Promise<string | null> {
  const path = statEvidencePath(value);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expirySeconds);
  if (error || !data) {
    console.error('[statEvidence] signed URL error:', error?.message, 'path:', path);
    return null;
  }
  return data.signedUrl;
}

// ── Multi-file evidence ─────────────────────────────────────────────────
// A stat can now carry several evidence files (athlete_stats.evidence_urls,
// a text[] column — see the migration note in AthleteProfilePage.tsx).
// evidence_url (singular) is kept around untouched for rows submitted
// before multi-file support shipped; every reader here treats
// evidence_urls as primary and falls back to wrapping the legacy single
// value in a one-item list when evidence_urls is empty/missing.

/** Normalizes a stat's legacy single value + new array value into one ordered list of bare storage paths. */
export function statEvidencePaths(
  legacyUrl: string | null | undefined,
  urls: string[] | null | undefined,
): string[] {
  if (urls && urls.length > 0) {
    return urls.map(statEvidencePath).filter((p): p is string => !!p);
  }
  const single = statEvidencePath(legacyUrl);
  return single ? [single] : [];
}

/**
 * Resolves every evidence file for a stat into fresh signed URLs, in the
 * same order as statEvidencePaths. A file that fails to sign is dropped
 * rather than breaking the whole list — same "degrade, don't break"
 * reasoning as resolveStatEvidenceUrl.
 */
export async function resolveStatEvidenceUrls(
  legacyUrl: string | null | undefined,
  urls: string[] | null | undefined,
  expirySeconds = 300,
): Promise<string[]> {
  const paths = statEvidencePaths(legacyUrl, urls);
  if (paths.length === 0) return [];
  const signed = await Promise.all(paths.map(async path => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expirySeconds);
    if (error || !data) {
      console.error('[statEvidence] signed URL error:', error?.message, 'path:', path);
      return null;
    }
    return data.signedUrl;
  }));
  return signed.filter((u): u is string => !!u);
}
