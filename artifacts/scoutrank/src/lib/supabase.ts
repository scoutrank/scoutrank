import { createClient } from '@supabase/supabase-js';

// Trim whitespace and trailing slashes — common copy-paste mistakes.
const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
let supabaseUrl = rawSupabaseUrl;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

// Auto-correct: detect if VITE_SUPABASE_URL contains a JWT (the anon key)
// rather than a proper project URL. This occurs when the user pastes the
// wrong field from the Supabase dashboard. The JWT may appear bare, prefixed
// with https://, or suffixed with .supabase.co — match it anywhere in the string.
const jwtMatch = rawSupabaseUrl.match(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/);
if (jwtMatch) {
  try {
    const payload = JSON.parse(atob(jwtMatch[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.ref) {
      supabaseUrl = `https://${payload.ref}.supabase.co`;
      console.warn('[supabase] VITE_SUPABASE_URL contained a JWT — auto-corrected URL to:', supabaseUrl);
    }
  } catch {
    // ignore decode errors, will fail below with a clear message
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Create a .env file in artifacts/scoutrank ' +
    '(copy .env.example) with VITE_SUPABASE_URL (e.g. https://xyz.supabase.co) ' +
    'and VITE_SUPABASE_ANON_KEY, then restart the dev server.'
  );
}

console.info('[supabase] connecting to:', supabaseUrl);

export { supabaseUrl, supabaseAnonKey };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type Tables = {
  users: User;
  profiles: Profile;
  athlete_details: AthleteDetail;
  sports: Sport;
  athlete_sports: AthleteSport;
  clubs: Club;
  teams: Team;
  schools: School;
  achievements: Achievement;
  stats: Stat;
  stat_entries: StatEntry;
  rankings: Ranking;
  ranking_snapshots: RankingSnapshot;
  highlights: Highlight;
  media_assets: MediaAsset;
  posts: Post;
  post_reactions: PostReaction;
  post_comments: PostComment;
  follows: Follow;
  notifications: Notification;
  verification_requests: VerificationRequest;
  disputes: Dispute;
  reports: Report;
  ai_summaries: AISummary;
  athlete_resumes: AthleteResume;
  admin_actions: AdminAction;
  moderation_cases: ModerationCase;
  badges: Badge;
};

// Types
export interface User {
  id: string;
  email: string;
  role: 'athlete' | 'coach' | 'scout' | 'parent' | 'admin' | 'super_admin';
  created_at: string;
  updated_at: string;
}

// ════════════════════════════════════════════════════════════════
// REAL TABLES — these match what actually exists in Supabase.
// (profiles, athlete_details, posts, post_reactions, follows,
//  notifications, achievements, rankings, disputes)
// ════════════════════════════════════════════════════════════════

export interface Profile {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string;
  age: number | null;
  sport: string | null;
  owned_organisation_id: string | null;
  age_group: string | null;
  country: string;
  state: string;
  city: string;
  role: 'athlete' | 'coach' | 'scout' | 'parent' | 'admin' | 'super_admin';
  created_at: string;
  // Confirmed via information_schema on 2026-06-24 (SQL #3) — a second,
  // redundant set of columns that coexists with the ones above on the
  // live table. Real, but largely duplicative (e.g. both `username`-based
  // name fields above AND `full_name` here; both `age` above AND
  // `date_of_birth` here). Treat the set above as primary/authoritative
  // going forward since the signup trigger writes to those, not these —
  // these may simply be unpopulated (null/0) on rows created via that
  // trigger. Confirmed NOT to exist (SQL #4): account_status.
  // UPDATE: account_status is now used by admin ban/suspend actions —
  // requires: alter table profiles add column if not exists account_status
  // text default 'active'; (see conversation notes). Optional/nullable
  // here since older rows won't have it until that migration runs.
  account_status: 'active' | 'suspended' | 'banned' | 'restricted' | null;
  // Set only while account_status === 'restricted' — posts, comments, and
  // followers stay hidden from others until this passes, then the
  // restriction has no further effect (enforced by RLS checking this
  // timestamp directly, not by anything flipping account_status back).
  restricted_until: string | null;
  // Captured client-side right after signup (best-effort, not spoof-proof
  // — someone deliberately evading a ban via a VPN defeats this). Used
  // only to flag likely matches for a human to review, never to
  // auto-block anything on its own.
  signup_ip: string | null;
  // Set by "Log Out of All Devices" — every other open tab/session for
  // this account picks this up via realtime and force-signs-out
  // immediately, rather than waiting for their access token to expire.
  session_invalidated_at: string | null;
  recruitment_open: boolean | null;
  recruitment_seeking: string[] | null;
  // Both optional, athlete-controlled, shown on the Performance Passport
  // only when filled in — neither is required and both can be left blank.
  academic_info: string | null;
  injury_history: string | null;
  // Self-reported fallback for Athlete DNA attributes with no verified
  // stat data to derive a real score from — shape: { speed?: number,
  // agility?: number, strength?: number, endurance?: number, power?:
  // number, coordination?: number }, each 0-100.
  dna_self_reported: Record<string, number> | null;
  // Selling on Combine requires approval first — a real gate,
  // not just per-listing AI review, given minors use this platform and
  // coaching_session listings involve direct contact.
  seller_status: 'not_applied' | 'pending' | 'approved' | 'rejected' | 'suspended' | null;

  // Denormalized "current state" moderation fields — the full history
  // lives in account_moderation_log; these are just for fast lookups
  // without a join. status_reason covers both suspension and ban reasons.
  // suspended_until is null for bans (permanent until manually released).
  status_reason: string | null;
  suspended_until: string | null;
  status_changed_by: string | null;
  status_changed_at: string | null;
  // Photo/video evidence a staff member attaches when suspending/banning
  // — shown to the person on the dedicated restricted-account page.
  status_evidence_url: string | null;
  user_id: string;
  full_name: string | null;
  date_of_birth: string | null;
  is_verified: boolean | null;
  // Real as of SQL #55 (2026-06-24) — scoped specifically to coach/
  // scout verification, deliberately separate from is_verified above
  // (which stays free for whatever future use it may have for other
  // account types). Null for athletes and for any coach/scout not yet
  // through the (not yet built) verification flow.
  onboarding_completed: boolean;
  coach_scout_verification_status: 'pending' | 'verified' | 'rejected' | 'revoked' | null;
  children_visibility: 'public' | 'followers_only' | 'private';
  follower_count: number | null;
  following_count: number | null;
  scoutrank_score: number | null;
  updated_at: string | null;
  // Real as of SQL #33/#34 (2026-06-24). is_public existed before this
  // as a nullable legacy column with no default — SQL #33 backfills and
  // constrains it rather than just adding it, so it's listed here as
  // properly non-nullable now rather than alongside the other legacy
  // fields above.
  is_public: boolean;
  show_rankings: boolean;
  show_stats: boolean;
  message_permission: 'everyone' | 'followers' | 'no_one';
  notify_reactions: boolean;
  notify_comments: boolean;
  notify_replies: boolean;
  notify_follows: boolean;
  notify_messages: boolean;
  theme_preference: 'dark' | 'ultra_dark';
}

// Convenience helper — there is no full_name column in the database,
// it must always be computed client-side from first_name/last_name.
export function fullName(p: Pick<Profile, 'first_name' | 'last_name'> | null | undefined): string {
  if (!p) return '';
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
}

// Human-readable role label for a profile. Club/organisation accounts are
// still stored with role:'coach' under the hood (there's no dedicated
// 'organisation' role in the schema yet — see ClubSignupPage.tsx), so a
// profile that owns an organisation would otherwise show as "Coach"
// everywhere, including on its own profile/dashboard. This doesn't touch
// the underlying `role` column — it only changes what's displayed.
export function displayRole(p: Pick<Profile, 'role' | 'owned_organisation_id'> | null | undefined): string {
  if (!p) return 'Athlete';
  if (p.owned_organisation_id) return 'Club';
  return p.role ? p.role.charAt(0).toUpperCase() + p.role.slice(1) : 'Athlete';
}

export interface AthleteDetail {
  profile_id: string;
  primary_sport: string;
  secondary_sports: string; // comma-joined text, not an array column
  position: string;
  height: string;
  weight: string;
  dominant_hand_foot: string;
  competition_level: string;
  club: string;
}

export interface Sport {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon: string;
}

export interface AthleteSport {
  id: string;
  profile_id: string;
  sport_id: string;
  positions: string[];
  is_primary: boolean;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  banner_url: string;
  bio: string;
  location: string;
  sport_ids: string[];
  member_count: number;
  verified: boolean;
}

export interface Team {
  id: string;
  club_id: string;
  name: string;
  sport_id: string;
  age_group: string;
  gender: string;
  level: string;
}

export interface School {
  id: string;
  name: string;
  logo_url: string;
  location: string;
  type: string;
}

// Real as of SQL #64 (2026-06-24).
export interface ParentAthleteLink {
  id: string;
  parent_profile_id: string;
  athlete_profile_id: string;
  requested_by: 'parent' | 'athlete';
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  athlete_approved_at: string | null;
  created_at: string;
}

// Real as of SQL #63 (2026-06-24).
export interface OrganisationRequest {
  id: string;
  requester_profile_id: string;
  organisation_name: string;
  organisation_type: 'club' | 'school' | 'academy' | 'organisation';
  country: string;
  state: string | null;
  city: string | null;
  website: string | null;
  additional_notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_id: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_organisation_id: string | null;
  created_at: string;
}

// Real as of SQL #62 (2026-06-24).
// Single table reused by: verification autocomplete, future club/school
// profile pages, and future organisation accounts.
export interface Organisation {
  id: string;
  name: string;
  type: 'club' | 'school' | 'academy' | 'organisation';
  sports: string[];        // same slugs as SPORT_OPTIONS
  country: string;
  state: string | null;
  city: string | null;
  website: string | null;
  official_email: string | null;
  verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Added for the org owner's own "manage this club" page — see the
  // organisation_profile_fields migration. Nullable: most orgs won't
  // have set these until an owner visits Manage and fills them in.
  bio: string | null;
  logo_url: string | null;
  banner_url: string | null;
}

// Real as of the organisation_profile_fields migration. Rows are written
// server-side by the review-organisation-claim edge function (service
// role) when a claim is approved — 'owner' is the only role granted
// there today. The frontend only reads/deletes this table (via RLS,
// scoped to an org's own staff); there's no self-serve "invite a
// teammate" flow yet, so every org has exactly one staff row until one
// gets added by hand.
export interface OrganisationStaff {
  id: string;
  organisation_id: string;
  profile_id: string;
  role: 'owner' | 'staff';
  invited_by: string | null;
  created_at: string;
}

// Real as of the organisation_profile_fields migration. A club-authored
// announcement, deliberately separate from the main `posts` table/Feed
// (which is always authored by a single profile, has its own moderation
// and reaction/comment machinery) — this is a much simpler "news from
// this club" list scoped to one organisation's page.
export interface OrganisationPost {
  id: string;
  organisation_id: string;
  author_profile_id: string;
  content: string;
  created_at: string;
}

// Real as of the club_invites_and_teams migration. A club-initiated
// invite — the reverse direction of the athlete-initiated
// club_affiliation_requests flow. role_context distinguishes "invited as
// a coach/scout" (just shows them in the Coaches & Scouts tab once
// accepted) from "invited as a player" (accepting also sets the
// invitee's own profiles.affiliated_organisation_id, same column the
// existing join-request flow already sets).
export interface ClubInvite {
  id: string;
  organisation_id: string;
  invited_profile_id: string;
  invited_by: string | null;
  role_context: 'coach_scout' | 'athlete';
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  responded_at: string | null;
}

export interface Team {
  id: string;
  organisation_id: string;
  name: string;
  sport: string | null;
  age_group: string | null;
  created_at: string;
}

export interface TeamStaff {
  id: string;
  team_id: string;
  profile_id: string;
  created_at: string;
}

export interface TeamPlayer {
  id: string;
  team_id: string;
  profile_id: string;
  created_at: string;
}

// Combine — Phase 1, digital-only. No real payment processing yet
// (that needs a Stripe account, not something buildable in-app) — orders
// currently create a "pending_contact" record and notify the seller to
// arrange payment directly, which is genuinely useful today and the
// schema is already shaped for slotting real Stripe checkout in later.
export interface MarketplaceListing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  category: 'speed_agility' | 'strength' | 'endurance' | 'mental_performance' | 'position_specific' | 'video_analysis' | 'coaching_session' | 'assessment_package';
  dna_attribute: string | null;
  price_cents: number;
  currency: string;
  delivery_type: 'digital_download' | 'live_session';
  file_url: string | null;
  file_path: string | null;
  duration_weeks: number | null;
  sport_tag: string | null;
  status: 'active' | 'paused' | 'removed';
  created_at: string;
  removal_reason: string | null;
  removed_by: string | null;
  removed_at: string | null;
}

export interface MarketplaceOrder {
  id: string;
  listing_id: string | null;
  listing_title_snapshot: string | null;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  platform_fee_cents: number | null;
  seller_share_cents: number | null;
  status: 'pending_contact' | 'awaiting_payment' | 'paid' | 'delivered' | 'cancelled' | 'refunded';
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  paid_out: boolean;
  paid_out_at: string | null;
  created_at: string;
}

export interface Achievement {
  id: string;
  profile_id: string;
  title: string;
  description: string;
  sport: string;
  verified: boolean;
  evidence_url: string | null;
  created_at: string;
  // added by 02_schema_hardening_and_rls.sql (AI review / dispute pipeline):
  status: 'pending_review' | 'ai_approved' | 'ai_rejected' | 'disputed' | 'admin_approved' | 'admin_rejected';
  points_value: number;
  ai_feedback: string | null;
  // Real as of SQL #56 (2026-06-24)
  achievement_type: 'award' | 'record' | 'milestone' | 'selection' | 'medal' | 'personal_best' | 'other' | null;
  date_achieved: string | null;
}

// ════════════════════════════════════════════════════════════════
// NOT YET REAL — no backing table exists in Supabase for these.
// Kept only so existing UI code still compiles; pages using them
// are still showing placeholder/non-functional data until a real
// migration + rewiring happens (the "highlights/stats" rebuild).
// ════════════════════════════════════════════════════════════════

// Real as of SQL #46 (2026-06-24) — replaces the old Stat/StatEntry
// placeholders, which were never wired to anything (explicitly marked
// "NOT YET REAL" before this migration).
export interface StatEventType {
  id: string;
  sport: string;
  event_type: string;
  label: string;
  unit: string;
  higher_is_better: boolean;
  weight: number;
  created_at: string;
}

export interface AthleteStat {
  id: string;
  profile_id: string;
  stat_event_type_id: string | null;   // null for custom submissions
  value: number;
  event_date: string;
  age_group: string | null;
  verification_status: 'pending' | 'verified' | 'rejected' | 'disputed';
  evidence_url: string | null;
  rejection_reason: string | null;     // set by admin on reject; shown to athlete
  created_at: string;
  // Custom event metadata — populated when stat_event_type_id is null
  custom_sport:      string | null;
  custom_event_name: string | null;
  custom_unit:       string | null;
  // Competition level the result was achieved at (recreational through
  // international) — set at submission, used by AI scoring alongside the
  // raw value. ai_score is the 0.00-100.00 score the AI assigns this
  // specific stat once verified; profiles.scoutrank_score is the average
  // of ai_score across all of an athlete's verified stats.
  competition_level: string | null;
  ai_score: number | null;
  // Athlete's own written description of the evidence (jersey/guernsey
  // number, headgear, appearance) — what the AI evidence review checks
  // the photo/video against.
  evidence_description: string | null;
}

// Real as of SQL #50/#55 (2026-06-24). Verification status lives on
// profiles.coach_scout_verification_status, not here — account-level,
// not per coverage row. age_group is NOT restricted to 16+ at the
// schema level (SQL #54's restriction was reverted in #55) — all 5
// buckets remain valid here, same as athlete_stats.age_group. The 16+
// rule is UI-only for normal onboarding; a future verified-junior-
// coach pathway can use U14 without a migration.
export interface CoverageArea {
  id: string;
  profile_id: string;
  sport: string;
  age_group: 'U14' | 'U16' | 'U18' | 'U20' | 'Open';
  country: string;
  state: string | null;
  location_detail: string | null;
  created_at: string;
}

// Full audit trail for suspend/ban/release actions — the profiles table
// only holds the current state, this holds every event that ever
// happened, including who performed it.
export interface AccountModerationLog {
  id: string;
  profile_id: string;
  action: 'suspended' | 'banned' | 'released';
  reason: string | null;
  evidence_url: string | null;
  suspended_until: string | null;
  performed_by: string | null;
  created_at: string;
}

// A person disputing their own suspension/ban — separate from stat_disputes
// (which are about AI-declined evidence, not account restrictions).
export interface AccountDispute {
  id: string;
  profile_id: string;
  moderation_log_id: string;
  message: string | null;
  status: 'open' | 'resolved';
  resolution: 'upheld' | 'overturned' | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface Ranking {
  profile_id: string;
  sport: string;
  rank_score: number;
  updated_at: string;
}

export interface RankingSnapshot {
  id: string;
  ranking_id: string;
  rank: number;
  score: number;
  snapshot_date: string;
}

export interface Highlight {
  id: string;
  profile_id: string;
  title: string;
  description: string;
  media_urls: string[];
  sport_id: string;
  tags: string[];
  created_at: string;
}

export interface MediaAsset {
  id: string;
  owner_id: string;
  url: string;
  type: 'image' | 'video';
  thumbnail_url: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  profile_id: string;
  caption: string;
  media_url: string | null;
  media_type: 'photo' | 'video' | 'audio' | null;
  sport_tag: string | null;
  created_at: string;
  // Added SQL #85
  post_type: 'post' | 'highlight' | 'achievement';
  achievement_title: string | null;
}

export interface PostReaction {
  id: string;
  post_id: string;
  profile_id: string;
  type: string; // 'boost' (💪)
  created_at: string;
}

// Real as of SQL #24 (2026-06-24), extended with parent_comment_id via
// SQL #26 (2026-06-24) to support one-level-deep replies. No updated_at
// — no edit feature yet.
export interface PostComment {
  id: string;
  post_id: string;
  profile_id: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
}

// Real as of SQL #28 (2026-06-24) — conversations/participants/messages/
// message_reactions. message_reactions exists in the DB but isn't wired
// to any UI yet (text messaging first, per requirements).
export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  created_by: string | null;
  last_message_at: string;
  created_at: string;
}

export interface ConversationParticipant {
  conversation_id: string;
  profile_id: string;
  joined_at: string;
  last_read_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: 'photo' | 'video' | 'audio' | null;
  shared_post_id: string | null;
  created_at: string;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  profile_id: string;
  type: string;
  created_at: string;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

// Real as of SQL #31 (2026-06-24). The previous version of this type
// (user_id/message) was an unconfirmed placeholder guessed from the
// assignment doc — never actually matched anything real, and was never
// used anywhere (the notification bell ran entirely on a fake in-memory
// system until this migration).
export interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string; // open-ended on purpose — new types need no schema change
  target_type: string;
  target_id: string;
  read: boolean;
  created_at: string;
}

export interface Dispute {
  id: string;
  achievement_id: string;
  profile_id: string;
  explanation: string;
  evidence_url: string | null;
  ai_reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'partial' | 'info_requested';
  admin_notes: string | null;
  points_delta: number;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface VerificationRequest {
  id: string;
  profile_id: string;
  target_type: 'achievement' | 'stat' | 'profile' | 'badge';
  target_id: string;
  evidence_urls: string[];
  notes: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_info';
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Dispute {
  id: string;
  profile_id: string;
  verification_request_id: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  explanation: string;
  evidence_urls: string[];
  status: 'open' | 'under_review' | 'resolved' | 'rejected';
  resolution: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: 'post' | 'profile' | 'comment' | 'achievement' | 'stat';
  target_id: string;
  reason: string;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  reviewed_by: string | null;
  created_at: string;
}

export interface AISummary {
  id: string;
  profile_id: string;
  summary_type: 'athlete_overview' | 'performance_analysis' | 'ranking_insight';
  content: string;
  metadata: Record<string, unknown>;
  generated_at: string;
  updated_at: string;
}

export interface AthleteResume {
  id: string;
  profile_id: string;
  title: string;
  content: string;
  sections: Record<string, unknown>;
  is_public: boolean;
  generated_at: string;
  updated_at: string;
}

export interface AdminAction {
  id: string;
  admin_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ModerationCase {
  id: string;
  case_type: 'dispute' | 'report' | 'verification' | 'ai_flag' | 'suspicious_activity';
  reference_id: string;
  assigned_to: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  notes: string;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface Badge {
  id: string;
  profile_id: string;
  badge_type: string;
  name: string;
  description: string;
  icon_url: string;
  awarded_at: string;
}

// ── Score display helper ──────────────────────────────────────────────
// DB stores rank_score as 0.00–100.00 (V1 final scale, set by SQL #87).
// Two decimal places always.
export function displayScoutRank(raw: number | null | undefined): string {
  if (raw == null) return 'Not Ranked';
  return Number(raw).toFixed(2);
}
