import * as tus from 'tus-js-client';
import { supabase, supabaseUrl } from '@/lib/supabase';

export type MediaKind = 'photo' | 'video' | 'audio';

// Hard ceiling enforced client-side before even attempting an upload —
// keep this in sync with whatever limit is configured on the Supabase
// Storage bucket itself (Project Settings -> Storage -> file size limit,
// and the bucket's own "file size limit" if set individually). Raising
// this number here does nothing on its own if the bucket is still capped
// lower — both have to agree.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024; // 4GB

// Supabase's resumable (TUS) upload endpoint requires chunks of exactly
// 6MB — this isn't a tunable performance knob, it's a hard protocol
// requirement on their side.
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

function extensionFromMime(mime: string, kind: MediaKind): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  // No reliable mime (e.g. some recorders report '' for certain
  // codecs) — fall back to a sensible default per kind.
  return kind === 'photo' ? 'jpg' : 'webm';
}

export function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  return 'audio';
}

export interface UploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  percent: number; // 0-100
}

/**
 * Resumable, chunked upload to any Supabase Storage bucket using the TUS
 * protocol — this is what actually fixes "videos take forever and
 * sometimes just don't finish": instead of one giant fragile HTTP request
 * that restarts from zero on any network hiccup, the file goes up in 6MB
 * pieces. A dropped connection resumes from the last completed chunk
 * instead of starting over, and onProgress gives real, live feedback
 * instead of the UI just sitting there looking frozen.
 */
export function uploadResumable(
  bucket: string,
  path: string,
  file: File | Blob,
  opts: { onProgress?: (p: UploadProgress) => void; contentType?: string } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error(`File is too large (${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB). Maximum is 4GB.`));
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const accessToken = session?.access_token;
      if (!accessToken) {
        reject(new Error('Not signed in — cannot upload.'));
        return;
      }

      const upload = new tus.Upload(file, {
        endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${accessToken}`,
          'x-upsert': 'false',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: bucket,
          objectName: path,
          contentType: opts.contentType || (file as File).type || 'application/octet-stream',
          cacheControl: '3600',
        },
        chunkSize: TUS_CHUNK_SIZE,
        onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
        onProgress: (bytesUploaded, bytesTotal) => {
          opts.onProgress?.({
            bytesUploaded,
            bytesTotal,
            percent: bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0,
          });
        },
        onSuccess: () => resolve(),
      });

      // Resume an interrupted upload of this exact file if the browser
      // still has it recorded (e.g. tab was closed mid-upload and
      // reopened) instead of always restarting from byte zero.
      upload.findPreviousUploads().then(previousUploads => {
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      });
    }).catch(reject);
  });
}

/** Builds the final public URL for a file already uploaded to a bucket/path. */
export function publicUrlFor(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// Uploads a Blob/File to the post-media bucket under the uploader's own
// profile-id folder (required for the post_media_insert_own_folder
// Storage policy from SQL #30 to allow the write), then returns the
// real public URL. Now resumable/chunked so large videos survive
// network hiccups instead of failing outright.
export async function uploadMediaBlob(
  blob: Blob,
  profileId: string,
  kind: MediaKind,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const ext = extensionFromMime(blob.type, kind);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${profileId}/${filename}`;

  try {
    await uploadResumable('post-media', path, blob, { onProgress, contentType: blob.type });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mediaStorage] upload failed:', msg);
    throw new Error(`Failed to upload media: ${msg}`);
  }

  return publicUrlFor('post-media', path);
}
