-- ============================================================================
-- 2026-10-04h_order_tags.sql
--
-- WHAT: `order_tags` — short identifications an operator pins on a package as
--       it moves through the building ("Damaged", "Missing part", "On hold",
--       or a custom label up to 32 characters). Read and written by the Live
--       feed (`/operations/live-feed`, `/m/live-feed`); vocabulary in
--       src/lib/live-feed/tags.ts.
--
-- WHY A NEW TABLE: tags are a SET (add / remove, at most one of each label per
--       package), not an append-only trail, so they cannot live in
--       `order_notes`. Free-text comments on the same package stay in
--       `order_notes` (the internal-ops annotation home, 2026-07-28) — this
--       migration deliberately adds no second comment store.
--
-- GRAIN: one row per (order row, tag). The order row is Allocate's grain, the
--       board's card and the comment anchor; orders sharing a box are tagged
--       one by one.
--
-- TENANT-FROM-BIRTH: `organization_id UUID NOT NULL`, no DEFAULT in the DDL;
--       enforce_tenant_isolation() installs the loud-fail GUC default, FORCE
--       RLS and the canonical policy. Safe at birth: the table has no writers
--       yet, and its only writer (src/lib/live-feed/tag-store.ts) runs in
--       withTenantTransaction and stamps organization_id explicitly.
--
-- ROLLBACK: select relax_tenant_isolation('order_tags');
--           DROP TABLE IF EXISTS order_tags;
--
-- VERIFY:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'order_tags';
--   \d order_tags   -- ux_order_tags_org_order_label present
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS order_tags (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,                    -- no DEFAULT; helper installs the loud-fail GUC default
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tag                 TEXT NOT NULL,
  created_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_tags_tag_shape CHECK (tag = BTRIM(tag) AND char_length(tag) BETWEEN 1 AND 32)
);

-- One of each label per package, case-insensitively; also the board's read
-- path ("this org's tags for these orders").
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_tags_org_order_label
  ON order_tags (organization_id, order_id, lower(tag));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_tags');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_tags left without FORCE RLS';
  END IF;
END $$;

COMMIT;
