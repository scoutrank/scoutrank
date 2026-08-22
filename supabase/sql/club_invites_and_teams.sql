-- Migration: club_invites_and_teams
-- Backs four new club-management features on the club's own page
-- (OrganisationProfilePage.tsx):
--   1. Club invites a coach/scout to its roster (Coaches & Scouts tab).
--   2. Club invites a player to its roster (Athletes tab).
--   3. Club creates Teams and links coaches/scouts to each as coaching staff.
--   4. Club adds players to each Team's roster.
--
-- Deliberately built as NEW tables rather than changing what already
-- exists:
--   - The Coaches & Scouts tab's existing "verified via admin" list
--     (verification_submissions) is untouched — invited-and-accepted
--     coaches/scouts show up ALONGSIDE that list in the UI, not instead
--     of it.
--   - The Athletes tab's existing query (profiles.affiliated_organisation_id
--     = this org) is untouched too — accepting a club's invite just sets
--     that same column, the same as it's always been set by the existing
--     athlete-initiated join-request flow. The tab needs no query change.
--
-- Safe to run more than once — tables/columns use IF NOT EXISTS, and every
-- policy is dropped and recreated rather than assuming it doesn't exist yet.

-- ── 1. Club invites (both coach/scout and athlete invites, one table) ──
CREATE TABLE IF NOT EXISTS club_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  invited_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  role_context text NOT NULL CHECK (role_context IN ('coach_scout', 'athlete')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

-- One pending invite per (club, person) at a time — re-inviting after a
-- decline is still allowed (that just creates a new row), this only
-- blocks sending a second invite while one is already awaiting a reply.
DROP INDEX IF EXISTS club_invites_one_pending_per_person;
CREATE UNIQUE INDEX club_invites_one_pending_per_person
  ON club_invites (organisation_id, invited_profile_id)
  WHERE status = 'pending';

ALTER TABLE club_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_invites_select ON club_invites;
CREATE POLICY club_invites_select ON club_invites
  FOR SELECT USING (
    invited_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM organisation_staff
      WHERE organisation_staff.organisation_id = club_invites.organisation_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS club_invites_insert_staff ON club_invites;
CREATE POLICY club_invites_insert_staff ON club_invites
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM organisation_staff
      WHERE organisation_staff.organisation_id = club_invites.organisation_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

-- The invited person accepts/declines their own invite.
DROP POLICY IF EXISTS club_invites_update_invitee ON club_invites;
CREATE POLICY club_invites_update_invitee ON club_invites
  FOR UPDATE USING (invited_profile_id = auth.uid());

-- Club staff can cancel a pending invite they sent.
DROP POLICY IF EXISTS club_invites_delete_staff ON club_invites;
CREATE POLICY club_invites_delete_staff ON club_invites
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM organisation_staff
      WHERE organisation_staff.organisation_id = club_invites.organisation_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

-- ── 2. Teams ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sport text,
  age_group text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_select_all ON teams;
CREATE POLICY teams_select_all ON teams FOR SELECT USING (true);

DROP POLICY IF EXISTS teams_insert_staff ON teams;
CREATE POLICY teams_insert_staff ON teams
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_staff
      WHERE organisation_staff.organisation_id = teams.organisation_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS teams_update_staff ON teams;
CREATE POLICY teams_update_staff ON teams
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organisation_staff
      WHERE organisation_staff.organisation_id = teams.organisation_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS teams_delete_staff ON teams;
CREATE POLICY teams_delete_staff ON teams
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM organisation_staff
      WHERE organisation_staff.organisation_id = teams.organisation_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

-- ── 3. Team coaching staff ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, profile_id)
);

ALTER TABLE team_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_staff_select_all ON team_staff;
CREATE POLICY team_staff_select_all ON team_staff FOR SELECT USING (true);

DROP POLICY IF EXISTS team_staff_insert_org_staff ON team_staff;
CREATE POLICY team_staff_insert_org_staff ON team_staff
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams
      JOIN organisation_staff ON organisation_staff.organisation_id = teams.organisation_id
      WHERE teams.id = team_staff.team_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_staff_delete_org_staff ON team_staff;
CREATE POLICY team_staff_delete_org_staff ON team_staff
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teams
      JOIN organisation_staff ON organisation_staff.organisation_id = teams.organisation_id
      WHERE teams.id = team_staff.team_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

-- ── 4. Team players ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, profile_id)
);

ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_players_select_all ON team_players;
CREATE POLICY team_players_select_all ON team_players FOR SELECT USING (true);

DROP POLICY IF EXISTS team_players_insert_org_staff ON team_players;
CREATE POLICY team_players_insert_org_staff ON team_players
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams
      JOIN organisation_staff ON organisation_staff.organisation_id = teams.organisation_id
      WHERE teams.id = team_players.team_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_players_delete_org_staff ON team_players;
CREATE POLICY team_players_delete_org_staff ON team_players
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teams
      JOIN organisation_staff ON organisation_staff.organisation_id = teams.organisation_id
      WHERE teams.id = team_players.team_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

-- ── 5. Notifications — allow the recipient to mark their own read ──────
-- (No new table needed — this reuses the existing `notifications` table
-- the same way every other feature already does: a plain client-side
-- insert. Listed here only as a note, not a statement to run, in case
-- your existing notifications RLS is scoped tighter than "any signed-in
-- user can insert a notification for someone else" — if invite
-- notifications silently fail to appear, that policy is the first place
-- to check.)
