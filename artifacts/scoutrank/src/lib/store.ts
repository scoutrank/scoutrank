// store.ts is mostly the in-memory fake layer for features not yet
// migrated (follows helpers, achievements). The media capture/recording
// functions below are the exception — they're real, uploading to
// Supabase Storage via mediaStorage.ts (added as part of the post-media
// migration, 2026-06-24).
import { uploadMediaBlob } from '@/lib/mediaStorage';

// ═══════════════════════════════════════════════
// GLOBAL STORE (Singleton) — IN-MEMORY / FAKE
// What remains in this file: follows (unused, already migrated to real
// in AthleteProfilePage.tsx), and achievements (still fake, not yet
// migrated). Posts, comments, reactions, saves, and messaging have all
// been migrated to real Supabase tables — see each feature's respective
// page for the real implementation.
// ══════════════════════════════════════════════

// Posts are now real — see src/pages/FeedPage.tsx, DashboardPage.tsx, and
// AthleteProfilePage.tsx, which query/insert directly against Supabase's
// `posts` table. The fake in-memory post system (StoredPost, getPosts,
// addPost, deletePost, subscribePosts) was removed on 2026-06-24 as part
// of that migration.

// ═══════════════════════════════════════════════
// FOLLOWS (global)
// ══════════════════════════════════════════════
interface FollowRecord {
  followerId: string;
  followingId: string;
  createdAt: string;
}

const follows: Map<string, FollowRecord[]> = new Map();

export function getFollows(profileId: string): string[] {
  return (follows.get(profileId) || []).map(f => f.followingId);
}

export function getFollowers(profileId: string): string[] {
  const all: string[] = [];
  follows.forEach((records, followerId) => {
    if (records.some(f => f.followingId === profileId)) all.push(followerId);
  });
  return all;
}

export function follow(followerId: string, followingId: string) {
  if (followerId === followingId) return; // Cannot follow self
  const existing = follows.get(followerId) || [];
  if (!existing.some(f => f.followingId === followingId)) {
    follows.set(followerId, [...existing, { followerId, followingId, createdAt: new Date().toISOString() }]);
  }
  window.dispatchEvent(new CustomEvent('scoutrank:new-follow', { detail: { followerId, followingId } }));
}

export function unfollow(followerId: string, followingId: string) {
  const existing = follows.get(followerId) || [];
  follows.set(followerId, existing.filter(f => f.followingId !== followingId));
  window.dispatchEvent(new CustomEvent('scoutrank:unfollow', { detail: { followerId, followingId } }));
}

export function isFollowing(followerId: string, followingId: string): boolean {
  return (follows.get(followerId) || []).some(f => f.followingId === followingId);
}

// Messaging is now real — see src/pages/FeedPage.tsx, which queries/
// inserts directly against Supabase's conversations/conversation_
// participants/messages tables and uses Realtime for live delivery.
// The fake in-memory messaging system (Message, sendMessage,
// getMessages, getConversations, subscribeMessages, markMessagesRead)
// was removed on 2026-06-24 as part of that migration.

// ═══════════════════════════════════════════════
// REACTIONS (posts)
// ═══════════════════════════════════════════════
const reactions: Map<string, Set<string>> = new Map(); // postId -> Set<profileId>

export function reactToPost(postId: string, profileId: string) {
  const existing = reactions.get(postId) || new Set();
  if (existing.has(profileId)) {
    existing.delete(profileId);
  } else {
    existing.add(profileId);
  }
  reactions.set(postId, existing);
  window.dispatchEvent(new CustomEvent('scoutrank:reaction', { detail: { postId, profileId } }));
}

export function hasReacted(postId: string, profileId: string): boolean {
  return reactions.get(postId)?.has(profileId) || false;
}

export function getReactionCount(postId: string): number {
  return reactions.get(postId)?.size || 0;
}

// Comments are now real — see src/pages/FeedPage.tsx, which queries/
// inserts directly against Supabase's `post_comments` table. The fake
// in-memory comment system (Comment, addComment, getComments,
// subscribeComments) was removed on 2026-06-24 as part of that migration.

// Achievements are now real — see src/pages/AthleteProfilePage.tsx
// (AchievementsTab) and src/pages/OnboardingPage.tsx, which query/
// insert directly against Supabase's `achievements` table. The fake
// in-memory achievement system (Achievement, addAchievement,
// getAchievements, updateAchievementStatus, getAllAchievements) was
// removed on 2026-06-24 as part of that migration.

// ═══════════════════════════════════════════════
// DISPUTES
// ═══════════════════════════════════════════════
export interface Dispute {
  id: string;
  profileId: string;
  athleteName: string;
  achievementId: string;
  targetType: string;
  targetDesc: string;
  aiReason: string;
  athleteExplanation: string;
  evidenceCount: number;
  status: 'open' | 'under_review' | 'resolved' | 'rejected';
  createdAt: string;
}

const disputes: Map<string, Dispute[]> = new Map();

export function addDispute(profileId: string, athleteName: string, achievementId: string, targetType: string, targetDesc: string, aiReason: string, explanation: string, evidenceCount: number): Dispute {
  const d: Dispute = {
    id: `disp-${Date.now()}`,
    profileId,
    athleteName,
    achievementId,
    targetType,
    targetDesc,
    aiReason,
    athleteExplanation: explanation,
    evidenceCount,
    status: 'under_review',
    createdAt: new Date().toISOString(),
  };
  const existing = disputes.get(profileId) || [];
  disputes.set(profileId, [...existing, d]);
  return d;
}

export function getDisputesForProfile(profileId: string): Dispute[] {
  return disputes.get(profileId) || [];
}

export function getAllDisputes(): Dispute[] {
  return Array.from(disputes.values()).flat();
}

export function updateDisputeStatus(disputeId: string, status: Dispute['status']) {
  disputes.forEach((list, profileId) => {
    disputes.set(profileId, list.map(d => d.id === disputeId ? { ...d, status } : d));
  });
}

// ═══════════════════════════════════════════════
// NOTIFICATIONS (global) — IN-MEMORY / FAKE
// Standalone shape, intentionally NOT the real `Notification` type —
// real notifications now live in the `notifications` table (user_id,
// type, message, read) and should be queried from Supabase directly.
// This in-memory version is still used for a couple of UI-only toasts
// pending that rewiring.
// ═══════════════════════════════════════════════
export interface FakeNotification {
  id: string;
  profile_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

const globalNotifications: Map<string, FakeNotification[]> = new Map();

export function addGlobalNotification(profileId: string, notif: FakeNotification) {
  const existing = globalNotifications.get(profileId) || [];
  globalNotifications.set(profileId, [notif, ...existing]);
  window.dispatchEvent(new CustomEvent('scoutrank:notification', { detail: notif }));
}

export function getGlobalNotifications(profileId: string): FakeNotification[] {
  return globalNotifications.get(profileId) || [];
}

export function markGlobalNotificationRead(profileId: string, notifId: string) {
  const existing = globalNotifications.get(profileId) || [];
  globalNotifications.set(profileId, existing.map(n => n.id === notifId ? { ...n, is_read: true } : n));
}

export function getUnreadNotificationCount(profileId: string): number {
  return (globalNotifications.get(profileId) || []).filter(n => !n.is_read).length;
}

// ═══════════════════════════════════════════════
// MEDIA UPLOAD HELPERS
// ═══════════════════════════════════════════════
export async function capturePhotoFromCamera(profileId: string): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  try {
    return await new Promise<string>((resolve, reject) => {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      const canvas = document.createElement('canvas');
      video.addEventListener('loadeddata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Could not get canvas context')); return; }
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(async (blob) => {
          stream.getTracks().forEach(t => t.stop());
          if (!blob) { reject(new Error('Could not capture photo')); return; }
          try {
            const url = await uploadMediaBlob(blob, profileId, 'photo');
            resolve(url);
          } catch (err) {
            reject(err);
          }
        }, 'image/jpeg', 0.9);
      });
      setTimeout(() => { reject(new Error('Timeout')); stream.getTracks().forEach(t => t.stop()); }, 10000);
    });
  } catch (err) {
    stream.getTracks().forEach(t => t.stop());
    throw err;
  }
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Tries candidate MIME types in priority order and returns the first one
// the browser actually supports recording. mp4 is tried first for BOTH
// video and audio — not because of UA-sniffing, but because feature
// detection (MediaRecorder.isTypeSupported) naturally prefers it on
// Safari (where it's usually the only real option) while still being
// fine on Chrome/Firefox too, since they support it as well. No browser
// detection needed; the browser tells us what it can do.
function pickSupportedMimeType(candidates: string[]): string | undefined {
  return candidates.find(type => {
    try { return MediaRecorder.isTypeSupported(type); }
    catch { return false; }
  });
}

export async function recordVideoForSeconds(profileId: string, seconds: number = 30): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

  const preferredType = pickSupportedMimeType([
    'video/mp4',                  // Safari's real, playable format
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]);

  let recorder: MediaRecorder;
  try {
    recorder = preferredType
      ? new MediaRecorder(stream, { mimeType: preferredType })
      : new MediaRecorder(stream);
  } catch (err) {
    // Construction failed (e.g. unsupported MIME type on this browser).
    // Stop tracks immediately so the camera indicator turns off.
    stream.getTracks().forEach(t => t.stop());
    throw err;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = e => chunks.push(e.data);

  return new Promise<string>((resolve, reject) => {
    recorder.onstop = async () => {
      // recorder.mimeType is what the browser ACTUALLY used — possibly
      // different from what we requested if it silently fell back to
      // something else. Labeling the Blob with this (not a hardcoded
      // string) keeps the upload's Content-Type correct on every browser.
      const actualType = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: actualType });
      stream.getTracks().forEach(t => t.stop());

      try {
        // Real file upload — no base64 conversion, no client-side
        // playability guessing. The browser plays it back as a normal
        // HTTP-served video file, same as any other website's videos.
        const url = await uploadMediaBlob(blob, profileId, 'video');
        resolve(url);
      } catch (err) {
        reject(err);
      }
    };
    recorder.start();
    setTimeout(() => recorder.stop(), seconds * 1000);
  });
}

export async function recordAudioForSeconds(profileId: string, seconds: number = 30): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const preferredType = pickSupportedMimeType([
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ]);

  let recorder: MediaRecorder;
  try {
    recorder = preferredType
      ? new MediaRecorder(stream, { mimeType: preferredType })
      : new MediaRecorder(stream);
  } catch (err) {
    stream.getTracks().forEach(t => t.stop());
    throw err;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = e => chunks.push(e.data);

  return new Promise<string>((resolve, reject) => {
    recorder.onstop = async () => {
      const actualType = recorder.mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: actualType });
      stream.getTracks().forEach(t => t.stop());

      try {
        const url = await uploadMediaBlob(blob, profileId, 'audio');
        resolve(url);
      } catch (err) {
        reject(err);
      }
    };
    recorder.start();
    setTimeout(() => recorder.stop(), seconds * 1000);
  });
}

// ═══════════════════════════════════════════════
// AGE VALIDATION
// ══════════════════════════════════════════════
export function isUnderAge(dateOfBirth: string, minimumAge: number = 16): boolean {
  const today = new Date();
  const dob = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age < minimumAge;
}
