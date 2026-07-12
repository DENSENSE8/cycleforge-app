-- ============================================================================
-- 2026-07-11c: workflow_templates curation — visibility + review lifecycle
-- (Template Platform Phase 4: submit-from-org → curated catalog).
-- ============================================================================
-- Phase 3 shipped package export/import: a tenant can serialize one of its own
-- workflow definitions into a CycleForgeTemplatePackage and re-import it. Those
-- imported packages persist as NON-system workflow_templates rows (is_system =
-- FALSE), which are deliberately INVISIBLE to the system library GET (it lists
-- is_system = TRUE only). Phase 4 is the curation layer over exactly those rows:
--
--   * `visibility`     — who may see/clone a non-system template:
--       'private' (only the submitting org / admins — the default),
--       'org'      (reserved: shared within the submitting org's members),
--       'public'   (surfaced in the curated catalog to every tenant).
--   * `review_status`  — the moderation lifecycle for a submitted template:
--       'draft'     (a bare imported package, not yet submitted — the default),
--       'submitted' (an org asked a curator to review it for the public catalog),
--       'approved'  (a curator blessed it; paired with visibility='public'),
--       'rejected'  (a curator declined it; stays private).
--   * `submitted_by_org` — the org UUID that submitted the row for review. This
--       is the ONLY org linkage on this otherwise-GLOBAL table (workflow_templates
--       holds no tenant data; see 2026-06-22d), used purely for curation
--       attribution + "my submissions" filtering. NOT an FK / RLS column — the
--       table is not tenant-scoped and must stay readable by every org.
--   * `submitted_at` / `reviewed_at` — curation timestamps (instants, tz-aware).
--
-- System templates (is_system = TRUE) are curated-by-construction: this migration
-- stamps them visibility='public', review_status='approved' so the two new
-- columns describe them honestly without changing any existing behavior (the
-- system library GET still filters on is_system, not these columns).
--
-- TENANCY: workflow_templates is GLOBAL/system reference (no organization_id, not
-- RLS-enforced) — see 2026-06-22d and 2026-06-28m. This migration only adds
-- columns + CHECK constraints + one backfill UPDATE; no tenant surface, no
-- RLS/FORCE to wire. Additive, idempotent, immutable.
--
-- Named CHECK constraints per .claude/rules/polymorphic-tables.md (discriminator
-- columns get a named CHECK, wrapped in the idempotent duplicate_object guard).
--
-- DEPLOY ORDER: apply BEFORE (or with) the Phase 4 code deploy. The submit route
-- and curated-catalog routes reference these columns; code-first would 500 those
-- routes until applied. The existing system library GET and onboarding chooser
-- do NOT read these columns, so they are unaffected either way.
--
-- ROLLBACK:
--   ALTER TABLE workflow_templates DROP COLUMN IF EXISTS reviewed_at;
--   ALTER TABLE workflow_templates DROP COLUMN IF EXISTS submitted_at;
--   ALTER TABLE workflow_templates DROP COLUMN IF EXISTS submitted_by_org;
--   ALTER TABLE workflow_templates DROP COLUMN IF EXISTS review_status;
--   ALTER TABLE workflow_templates DROP COLUMN IF EXISTS visibility;
--   (the named CHECK constraints drop with their columns)
-- ============================================================================

BEGIN;

-- 1. Curation columns. Additive + nullable-or-defaulted so existing rows stay
--    valid without a rewrite. Defaults describe a freshly-imported package
--    (private draft) — the honest starting state for a non-system row.
ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS visibility        TEXT        NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS review_status     TEXT        NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_by_org  UUID,
  ADD COLUMN IF NOT EXISTS submitted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at       TIMESTAMPTZ;

-- 2. Named CHECK constraints enumerating the allowed discriminator values.
DO $$ BEGIN
  ALTER TABLE workflow_templates ADD CONSTRAINT workflow_templates_visibility_chk
    CHECK (visibility IN ('private', 'org', 'public'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE workflow_templates ADD CONSTRAINT workflow_templates_review_status_chk
    CHECK (review_status IN ('draft', 'submitted', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Backfill: system templates are curated-by-construction → public + approved.
--    Idempotent (re-running just re-affirms the same values). Non-system rows
--    keep the column defaults (private / draft).
UPDATE workflow_templates
   SET visibility = 'public', review_status = 'approved'
 WHERE is_system = TRUE
   AND (visibility <> 'public' OR review_status <> 'approved');

-- 4. Partial index for the two curation reads (curated catalog + review queue).
--    Curated catalog: approved public non-system rows. Review queue: submitted
--    rows. Both are small, curated subsets — a partial index keeps them cheap
--    without indexing the (majority) private-draft population.
CREATE INDEX IF NOT EXISTS idx_workflow_templates_curated
  ON workflow_templates (review_status, visibility)
  WHERE is_system = FALSE;

COMMENT ON COLUMN workflow_templates.visibility IS
  'Who may see/clone a non-system template: private (submitter/admins) | org (reserved) | public (curated catalog). System rows are public.';
COMMENT ON COLUMN workflow_templates.review_status IS
  'Moderation lifecycle for a submitted template: draft | submitted | approved | rejected. System rows are approved.';
COMMENT ON COLUMN workflow_templates.submitted_by_org IS
  'Org UUID that submitted this row for curation review. The only org linkage on this GLOBAL table; attribution only, NOT an FK/RLS column.';

COMMIT;
