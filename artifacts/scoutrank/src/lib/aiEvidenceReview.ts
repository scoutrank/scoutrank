import { supabase } from '@/lib/supabase';
import { extractVideoFrames, downsizeImage } from '@/lib/videoFrames';

export type SubmissionOutcome =
  | { status: 'verified'; reasoning: string; score: number | null }
  | { status: 'disputed'; reasoning: string }
  | { status: 'error'; error: string };

export interface EvidenceMedia {
  url: string;
  type: 'photo' | 'video';
}

interface SubmissionInput {
  statId: string;
  media: EvidenceMedia[];
}

// Same per-video frame count as the original single-file version (2) —
// unchanged so existing review behavior for a single video doesn't shift.
// With evidence now capped at MAX_EVIDENCE_FILES per stat (see
// AthleteProfilePage.tsx), the worst case — every file a video — still
// keeps total frames sent to Claude vision in a reasonable range.
const FRAMES_PER_VIDEO = 2;

/**
 * Runs right after a stat + one or more evidence files are submitted.
 * Frame extraction (for video) happens here in the browser, since that
 * genuinely requires browser APIs — but the actual AI review and the
 * privileged database writes (marking a stat verified/rejected, writing
 * scores) happen server-side in the review-stat-evidence Edge Function.
 *
 * This is what closes the loophole the first, fully-client-side version
 * had: the browser can ask for a review, but it can no longer fake the
 * outcome or write verification_status itself. The Edge Function also
 * re-reads the claimed stat value/description straight from the
 * database rather than trusting anything the client sends, so a
 * tampered request can't fake the inputs being judged either.
 */
export async function processNewStatSubmission(input: SubmissionInput): Promise<SubmissionOutcome> {
  let frames: string[];
  try {
    const perFile = await Promise.all(input.media.map(m =>
      m.type === 'photo' ? fetchAndDownsizePhoto(m.url) : fetchAndExtractFrames(m.url, FRAMES_PER_VIDEO),
    ));
    frames = perFile.flat();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'error', error: `Could not prepare evidence for review: ${msg}` };
  }

  const { data, error } = await supabase.functions.invoke('review-stat-evidence', {
    body: { statId: input.statId, frames, fileCount: input.media.length },
  });

  if (error) {
    // supabase.functions.invoke()'s error.message is a generic
    // "Edge Function returned a non-2xx status code" — it discards the
    // actual JSON body the function returned (e.g. which AI provider's
    // key failed), which is the one piece of information that actually
    // helps diagnose this. FunctionsHttpError carries the real Response
    // on `.context`; read the real message out of it when present.
    let detail = error.message;
    try {
      const context = (error as { context?: Response }).context;
      if (context) {
        const body = await context.clone().json().catch(() => null);
        if (body?.error) detail = body.error;
      }
    } catch {
      // Fall back to the generic message below.
    }
    return { status: 'error', error: `Review service failed: ${detail}` };
  }
  if (data?.error) {
    return { status: 'error', error: data.error };
  }
  if (data?.status === 'disputed') {
    return { status: 'disputed', reasoning: data.reasoning ?? '(no reasoning given)' };
  }
  if (data?.status === 'verified') {
    return { status: 'verified', reasoning: data.reasoning ?? '(no reasoning given)', score: data.score ?? null };
  }
  return { status: 'error', error: 'Review service returned an unexpected response.' };
}

async function fetchAndDownsizePhoto(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch photo (${res.status}).`);
  return downsizeImage(await res.blob());
}

async function fetchAndExtractFrames(url: string, maxFrames: number): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch video (${res.status}).`);
  return extractVideoFrames(await res.blob(), maxFrames);
}
