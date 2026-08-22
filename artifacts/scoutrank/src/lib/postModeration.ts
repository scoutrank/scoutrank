import { supabase } from '@/lib/supabase';
import { extractVideoFrames, downsizeImage } from '@/lib/videoFrames';

/**
 * Fire-and-forget: asks the moderate-post Edge Function to scan a
 * newly-created post/highlight. Never blocks or fails the post creation
 * flow itself — a moderation hiccup shouldn't stop someone from posting.
 * Both photos and video frames are downsized here in the browser before
 * sending — this account's Groq tier has an 8000 tokens-per-minute
 * ceiling, and a full-resolution original photo alone can blow past that
 * on its own (this is exactly what caused the 413 rate_limit_exceeded
 * error before this fix).
 */
export async function triggerPostModeration(postId: string, mediaUrl: string | null, mediaType: string | null): Promise<void> {
  try {
    let frames: string[] | undefined;
    if (mediaType === 'video' && mediaUrl) {
      try {
        const res = await fetch(mediaUrl);
        if (res.ok) frames = await extractVideoFrames(await res.blob(), 2);
      } catch {
        // If frame extraction fails, still scan the caption text alone
        // rather than skipping moderation entirely.
      }
    } else if (mediaType === 'photo' && mediaUrl) {
      try {
        const res = await fetch(mediaUrl);
        if (res.ok) frames = [await downsizeImage(await res.blob())];
      } catch {
        // Same fallback — scan the caption alone if this fails.
      }
    }
    const { data, error } = await supabase.functions.invoke('moderate-post', { body: { postId, frames } });
    if (error) {
      // The Supabase client's error.message is a generic wrapper ("Edge
      // Function returned a non-2xx status code") — the actual reason
      // is in the response body, which has to be read separately.
      let detail = error.message;
      const context = (error as { context?: Response }).context;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.clone().json();
          if (body?.error) detail = body.error;
        } catch {
          // body wasn't JSON — fall back to the generic message
        }
      }
      console.error('[moderation] Scan failed:', detail);
    } else if (data?.error) {
      console.error('[moderation] Function returned an error:', data.error);
    } else {
      console.info('[moderation] Scan result:', data);
    }
  } catch (err) {
    console.error('[moderation] Unexpected failure triggering scan:', err);
  }
}
