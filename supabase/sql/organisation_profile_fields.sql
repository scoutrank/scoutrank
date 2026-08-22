-- Migration: organisation_profile_fields
-- Backs the new "clubs get their own manage-able page" feature:
--   - Organisation.bio / logo_url / banner_url — self-editable by the org's
--     own staff (see OrganisationProfilePage.tsx's "Manage" tab).
--   - organisation_posts — a simple club-announcements feed, deliberately
--     separate from the main `posts` table (which is always authored by a
--     single profile and carries its own moderation/reaction/comment
--     machinery this doesn't need).
--   - RLS so an org's own staff (organisation_staff) can read/update the
--     right rows, and everyone else keeps read-only public access.
--
-- Safe to run more than once — columns/tables use IF NOT EXISTS, and every
-- policy is dropped and recreated rather than assuming it doesn't exist yet.
-- If any single statement errors because something already matches, skip
-- just that line and keep going.

-- ── 1. New organisation profile fields ──────────────────────────────────
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_url text;

-- ── 2. Club Posts table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisation_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organisation_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organisation_posts_select_all ON organisation_posts;
CREATE POLICY organisation_posts_select_all ON organisation_posts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS organisation_posts_insert_staff ON organisation_posts;
CREATE POLICY organisation_posts_insert_staff ON organisation_posts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_staff
      WHERE organisation_staff.organisation_id = organisation_posts.organisation_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS organisation_posts_delete_staff ON organisation_posts;
CREATE POLICY organisation_posts_delete_staff ON organisation_posts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM organisation_staff
      WHERE organisation_staff.organisation_id = organisation_posts.organisation_id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

-- ── 3. Organisations: staff can edit their own club's profile fields ───
DROP POLICY IF EXISTS organisations_update_own_staff ON organisations;
CREATE POLICY organisations_update_own_staff ON organisations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organisation_staff
      WHERE organisation_staff.organisation_id = organisations.id
        AND organisation_staff.profile_id = auth.uid()
    )
  );

-- ── 4. organisation_staff: staff can see their own club's roster, ──────
--       the owner can remove non-owner staff. This table previously had
--       no frontend-facing policies at all — everything about it ran
--       through the review-organisation-claim edge function's service
--       role, so nothing here could be read or changed from the app.
ALTER TABLE organisation_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organisation_staff_select_own_org ON organisation_staff;
CREATE POLICY organisation_staff_select_own_org ON organisation_staff
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organisation_staff s2
      WHERE s2.organisation_id = organisation_staff.organisation_id
        AND s2.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS organisation_staff_delete_owner_only ON organisation_staff;
CREATE POLICY organisation_staff_delete_owner_only ON organisation_staff
  FOR DELETE USING (
    role <> 'owner'
    AND EXISTS (
      SELECT 1 FROM organisation_staff s2
      WHERE s2.organisation_id = organisation_staff.organisation_id
        AND s2.profile_id = auth.uid()
        AND s2.role = 'owner'
    )
  );
