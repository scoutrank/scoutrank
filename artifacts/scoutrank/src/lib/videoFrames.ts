/** Downsizes a single image (e.g. a phone photo) to a small JPEG data URL for AI evidence review. */
export function downsizeImage(file: File | Blob, maxWidth = 800, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(img.naturalWidth || maxWidth, maxWidth);
      canvas.height = Math.round(canvas.width * ((img.naturalHeight || 1) / (img.naturalWidth || 1)));
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported.')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image file.')); };
    img.src = url;
  });
}

/**
 * Extracts a handful of evenly-spaced frames from a video file as JPEG
 * data URLs, entirely in the browser (an offscreen <video> + <canvas>,
 * nothing uploaded anywhere extra). This exists because AI vision models
 * (Groq included) can't watch a video directly — the closest real
 * approximation is sampling still frames and sending those as images.
 *
 * Worth being upfront about the limitation this creates: sampling ~6-8
 * frames from a full match can only catch whatever's visible in those
 * exact instants. It's a real, useful sanity-check (does the footage
 * look legitimate, does the jersey/colours match the description) but
 * it is NOT the same as watching the whole game — fast, discrete events
 * happening between sampled frames simply won't be visible.
 */
export function extractVideoFrames(file: File | Blob, maxFrames = 6): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onerror = () => { cleanup(); reject(new Error('Could not read video file for frame extraction.')); };

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          cleanup();
          reject(new Error('Video has no readable duration.'));
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth || 480, 640); // Claude reads fine detail (stopwatches, scoreboards) noticeably better than the previous model, and isn't boxed in by the tight per-minute token ceiling that forced this down to 384 before — this is a genuine quality improvement, not just size for size's sake
        canvas.height = Math.round(canvas.width * ((video.videoHeight || 360) / (video.videoWidth || 640)));
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); reject(new Error('Canvas not supported.')); return; }

        const frames: string[] = [];
        // Skip the very start/end (often blank/black) — sample evenly across the middle.
        const timestamps = Array.from({ length: maxFrames }, (_, i) =>
          duration * (0.05 + (0.9 * i) / Math.max(1, maxFrames - 1)));

        for (const t of timestamps) {
          await new Promise<void>((res, rej) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              frames.push(canvas.toDataURL('image/jpeg', 0.75));
              res();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = t;
            setTimeout(() => { video.removeEventListener('seeked', onSeeked); rej(new Error('Frame seek timed out.')); }, 8000);
          }).catch(() => { /* skip a frame that times out rather than failing the whole extraction */ });
        }

        cleanup();
        if (frames.length === 0) reject(new Error('Could not extract any frames from the video.'));
        else resolve(frames);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
  });
}
