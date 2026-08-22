import { supabase, fullName } from '@/lib/supabase';
import type { Profile, Post, PostComment, AthleteStat, Achievement, Message } from '@/lib/supabase';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Compiles everything a user owns into one readable, styled report and
 * triggers a download — a plain JSON dump technically had the same data,
 * but most people can't actually read raw JSON and don't have an app
 * to open it with. This opens directly in any browser by double-clicking,
 * like a normal webpage, and can be printed/saved to PDF from there if
 * someone wants a PDF specifically.
 */
export async function exportMyData(profileId: string): Promise<void> {
  const [profileRes, postsRes, commentsRes, statsRes, achievementsRes, messagesRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    supabase.from('posts').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
    supabase.from('post_comments').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
    supabase.from('athlete_stats').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
    supabase.from('achievements').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
    supabase.from('messages').select('*').eq('sender_id', profileId).order('created_at', { ascending: false }),
  ]);

  const profile = profileRes.data as Profile | null;
  const posts = (postsRes.data ?? []) as Post[];
  const comments = (commentsRes.data ?? []) as PostComment[];
  const stats = (statsRes.data ?? []) as AthleteStat[];
  const achievements = (achievementsRes.data ?? []) as Achievement[];
  const messages = (messagesRes.data ?? []) as Message[];

  const section = (title: string, bodyHtml: string) => `
    <section>
      <h2>${esc(title)}</h2>
      ${bodyHtml}
    </section>`;

  const profileHtml = profile ? `
    <div class="profile-card">
      ${profile.avatar_url ? `<img class="avatar" src="${esc(profile.avatar_url)}" alt="" />` : ''}
      <div>
        <p class="name">${esc(fullName(profile))}</p>
        <p class="muted">@${esc(profile.username)} &middot; ${esc(profile.role)}</p>
        <p class="muted">${esc([profile.city, profile.state, profile.country].filter(Boolean).join(', '))}</p>
        ${profile.bio ? `<p>${esc(profile.bio)}</p>` : ''}
        <p class="muted">Member since ${formatDate(profile.created_at)}</p>
      </div>
    </div>` : '<p class="muted">Profile not found.</p>';

  const postsHtml = posts.length === 0 ? '<p class="muted">No posts.</p>' : `
    <table>
      <thead><tr><th>Date</th><th>Caption</th><th>Media</th></tr></thead>
      <tbody>
        ${posts.map(p => `<tr><td>${formatDate(p.created_at)}</td><td>${esc(p.caption)}</td><td>${p.media_type ? esc(p.media_type) : '—'}</td></tr>`).join('')}
      </tbody>
    </table>`;

  const statsHtml = stats.length === 0 ? '<p class="muted">No stats submitted.</p>' : `
    <table>
      <thead><tr><th>Date</th><th>Event</th><th>Value</th><th>Status</th></tr></thead>
      <tbody>
        ${stats.map(s => `<tr><td>${formatDate(s.event_date)}</td><td>${esc(s.custom_event_name ?? 'Event')}</td><td>${esc(s.value)}</td><td>${esc(s.verification_status)}</td></tr>`).join('')}
      </tbody>
    </table>`;

  const achievementsHtml = achievements.length === 0 ? '<p class="muted">No achievements.</p>' : `
    <table>
      <thead><tr><th>Date</th><th>Title</th><th>Sport</th><th>Status</th></tr></thead>
      <tbody>
        ${achievements.map(a => `<tr><td>${formatDate(a.created_at)}</td><td>${esc(a.title)}</td><td>${esc(a.sport)}</td><td>${esc(a.status)}</td></tr>`).join('')}
      </tbody>
    </table>`;

  const commentsHtml = comments.length === 0 ? '<p class="muted">No comments.</p>' : `
    <table>
      <thead><tr><th>Date</th><th>Comment</th></tr></thead>
      <tbody>
        ${comments.map(c => `<tr><td>${formatDate(c.created_at)}</td><td>${esc(c.content)}</td></tr>`).join('')}
      </tbody>
    </table>`;

  const messagesHtml = messages.length === 0 ? '<p class="muted">No messages sent.</p>' : `
    <table>
      <thead><tr><th>Date</th><th>Message</th></tr></thead>
      <tbody>
        ${messages.map(m => `<tr><td>${formatDate(m.created_at)}</td><td>${esc(m.content ?? (m.media_type ? `[${m.media_type}]` : ''))}</td></tr>`).join('')}
      </tbody>
    </table>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ScoutRank Data Export</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B0E1A; color: #E8E9F0; max-width: 800px; margin: 0 auto; padding: 32px 20px 60px; line-height: 1.5; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #2A2F45; }
  .subtitle { color: #8B8FA8; font-size: 13px; margin-bottom: 24px; }
  .profile-card { display: flex; gap: 16px; align-items: flex-start; background: #131730; border: 1px solid #2A2F45; border-radius: 12px; padding: 16px; }
  .avatar { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; flex-shrink: 0; }
  .name { font-weight: 600; font-size: 16px; margin: 0 0 2px; }
  .muted { color: #8B8FA8; font-size: 13px; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #8B8FA8; font-weight: 500; padding: 6px 10px; border-bottom: 1px solid #2A2F45; }
  td { padding: 8px 10px; border-bottom: 1px solid #1A2035; vertical-align: top; }
  tr:hover td { background: #131730; }
  .note { margin-top: 40px; padding-top: 16px; border-top: 1px solid #2A2F45; color: #8B8FA8; font-size: 12px; }
  @media print { body { background: white; color: black; } .profile-card, td, th { border-color: #ccc; } tr:hover td { background: none; } }
</style>
</head>
<body>
  <h1>Your ScoutRank Data</h1>
  <p class="subtitle">Exported ${formatDate(new Date().toISOString())}. This file is yours to keep — open it anytime in a browser, or use your browser's Print &rarr; Save as PDF if you'd like a PDF copy.</p>

  ${section('Profile', profileHtml)}
  ${section(`Posts (${posts.length})`, postsHtml)}
  ${section(`Stats (${stats.length})`, statsHtml)}
  ${section(`Achievements (${achievements.length})`, achievementsHtml)}
  ${section(`Comments (${comments.length})`, commentsHtml)}
  ${section(`Messages Sent (${messages.length})`, messagesHtml)}

  <p class="note">Generated by ScoutRank. If anything here looks wrong or incomplete, contact support.</p>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scoutrank-data-export-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

