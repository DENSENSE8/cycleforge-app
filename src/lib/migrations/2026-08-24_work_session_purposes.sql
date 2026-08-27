-- 2026-08-24_work_session_purposes.sql
--
-- L1 PURPOSE CATALOG — expand step.
--
-- A work session is TITLED, not typed (S10). The durable reporting bucket is
-- a purpose ROW per org, not a CHECK on title and not a new scan_type.
-- Operators add "Staff assist" / "Product triage" / "Front desk" at
-- session-start with no deploy (K12). Adding a SCANNING bench still means
-- SURFACE_REGISTRY + SCAN_SESSION_TYPES (L0). Adding "I helped Jordan
-- identify inventory" must not.
--
-- Parents: work_sessions (2026-08-22b), title column (2026-08-23g).
-- SoT for the seed list: src/lib/sessions/purpose-catalog.ts.
--
-- ── FOUR LAYERS, NEVER COLLAPSED ────────────────────────────────────────────
--
--   L0 physics   kind / scan_type / surface_key     — already on work_sessions
--   L1 purpose   work_session_purposes              — THIS FILE
--   L2 instance  work_sessions.title + purpose_id   — this file, nullable
--   L3 time      work_session_intervals             — already 2026-08-23e
--
-- Reporting GROUP BY purpose_id. Never GROUP BY title (A2: renaming a session
-- must not reclassify the past). ops_events.session_type still follows
-- surface_key / scan_type via attributionOf — never the title, never the
-- purpose label.
--
-- ── WHY NOTES AND WRAP_UP ARE COLUMNS, NOT A SECOND CLOCK ───────────────────
--
-- Industry pattern for used-goods / recommerce desks (Amazon listing Change
-- History, end-of-shift recap, Takt kiosk wrap): the timesheet is intervals
-- + a title + a bucket + a wrap-up of what changed (from → to, why). That
-- prose is NOT duration. Duration stays a fold over work_session_intervals
-- (B11). Empty of ops_events is legal — a front-desk help with no scan is
-- still a session. Facts about entities (this customer, this serial, this
-- sale) stay on ops_events (D11); do not add a polymorphic entity_id here.
--
-- wrap_up_source is 'staff' | 'assistant' — who wrote the recap, not what
-- the work was called. A CHECK on that is physics, not vocabulary.
--
-- ── SAFETY / GATING ─────────────────────────────────────────────────────────
--
-- Pure expand (D6). New table + three nullable ADD COLUMNs + seed +
-- WHERE-null backfill. scan_type, its CHECK, and ux_work_sessions_armed_scan
-- are deliberately untouched (S1, S7 — Phase 3 of
-- 06-work-order-migration-path.md). No enum. No CHECK on key/label/title.
--
-- TENANCY: organization_id UUID NOT NULL, no DDL default, per-org unique
-- keys, enforce_tenant_isolation in this file. Seed is
-- organizations × VALUES so existing tenants get the catalog; new tenants
-- get the same rows from seedOrgCatalog (catalog-queries.ts).
--
-- ON CONFLICT DO NOTHING on the seed, deliberately — a tenant that already
-- relabelled "Triage" keeps their words.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
--   SELECT relax_tenant_isolation('work_session_purposes');
--   ALTER TABLE work_sessions
--     DROP CONSTRAINT IF EXISTS work_sessions_purpose_fk,
--     DROP COLUMN IF EXISTS purpose_id,
--     DROP COLUMN IF EXISTS notes,
--     DROP COLUMN IF EXISTS wrap_up,
--     DROP COLUMN IF EXISTS wrap_up_source;
--   DROP TABLE IF EXISTS work_session_purposes;
--
-- Safe at any point before a writer exists; after writers exist, drop the
-- columns only after they stop being selected.
--
-- ── VERIFY ──────────────────────────────────────────────────────────────────
--
--   \d+ work_session_purposes
--   \d+ work_sessions
--   SELECT key, label, default_kind, is_system
--     FROM work_session_purposes
--    WHERE organization_id = :org
--    ORDER BY sort_order;

BEGIN;

CREATE TABLE IF NOT EXISTS work_session_purposes (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,
  key                  TEXT NOT NULL,
  label                TEXT NOT NULL,
  default_surface_key  TEXT,
  default_kind         TEXT NOT NULL,
  is_system            BOOLEAN NOT NULL DEFAULT false,
  sort_order           INTEGER NOT NULL DEFAULT 1000,
  archived_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_session_purposes_kind_chk
    CHECK (default_kind IN ('scan', 'task')),
  CONSTRAINT work_session_purposes_key_nonempty
    CHECK (btrim(key) <> ''),
  CONSTRAINT work_session_purposes_label_nonempty
    CHECK (btrim(label) <> '')
);

-- Per-org identity. Never a global unique on key — two warehouses may both
-- have "unbox".
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_session_purposes_org_key
  ON work_session_purposes (organization_id, key);

-- Live labels cannot fork ("staff assist" vs "Staff Assist"). Archived rows
-- keep their label so history still reads; findOrCreate reuses them.
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_session_purposes_org_label_live
  ON work_session_purposes (organization_id, lower(label))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_session_purposes_org_sort
  ON work_session_purposes (organization_id, sort_order, id)
  WHERE archived_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_session_purposes');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_session_purposes left without FORCE RLS';
  END IF;
END $$;

-- Starter catalog. Mirrors SYSTEM_PURPOSES in purpose-catalog.ts. Scan keys
-- are the closed SCAN_SESSION_TYPES; everything else is a task bucket a
-- used-goods desk actually works (front desk, kiosk, product triage, …).
INSERT INTO work_session_purposes
  (organization_id, key, label, default_kind, default_surface_key, is_system, sort_order)
SELECT o.id, v.key, v.label, v.default_kind, v.default_surface_key, true, v.sort_order
FROM organizations o CROSS JOIN (VALUES
  ('unbox',          'Unbox',          'scan', 'unbox'::text,    10),
  ('triage',         'Triage',         'scan', 'triage',         20),
  ('pickup',         'Pickup',         'scan', 'pickup',         30),
  ('test',           'Test',           'scan', 'test',           40),
  ('pack',           'Pack',           'scan', 'pack',           50),
  ('outbound',       'Outbound',       'scan', 'outbound',       60),
  ('repair',         'Repair',         'task', 'repair',         70),
  ('support',        'Support',        'task', 'support',        80),
  ('incoming',       'Inbound',        'task', 'incoming',       90),
  ('front-desk',     'Front desk',     'task', NULL,            100),
  ('kiosk',          'Kiosk',          'task', NULL,            110),
  ('staff-assist',   'Staff assist',   'task', NULL,            120),
  ('product-triage', 'Product triage', 'task', NULL,            130),
  ('listing',        'Listing',        'task', NULL,            140),
  ('exception',      'Exception',      'task', NULL,            150),
  ('training',       'Training',       'task', NULL,            160),
  ('kitting',        'Kitting',        'task', NULL,            170),
  ('cleaning',       'Cleaning',       'task', NULL,            180),
  ('inventory',      'Inventory',      'task', NULL,            190)
) AS v(key, label, default_kind, default_surface_key, sort_order)
ON CONFLICT (organization_id, key) DO NOTHING;

-- ── work_sessions expand ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.work_sessions') IS NULL THEN
    RAISE NOTICE 'work_sessions absent — purpose_id / notes / wrap_up skipped';
    RETURN;
  END IF;

  ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS purpose_id BIGINT;
  ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS wrap_up TEXT;
  ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS wrap_up_source TEXT;

  BEGIN
    ALTER TABLE work_sessions
      ADD CONSTRAINT work_sessions_wrap_up_source_chk
      CHECK (wrap_up_source IS NULL OR wrap_up_source IN ('staff', 'assistant'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE work_sessions
      ADD CONSTRAINT work_sessions_purpose_fk
      FOREIGN KEY (purpose_id) REFERENCES work_session_purposes(id) ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_sessions_org_purpose
  ON work_sessions (organization_id, purpose_id, started_at DESC)
  WHERE purpose_id IS NOT NULL;

-- Backfill purpose_id from L0, then title from the purpose label. Both are
-- one-way: WHERE IS NULL so a rerun cannot clobber an operator rename (23g
-- title contract, A2).
UPDATE work_sessions ws
   SET purpose_id = p.id
  FROM work_session_purposes p
 WHERE ws.purpose_id IS NULL
   AND p.organization_id = ws.organization_id
   AND ws.kind = 'scan'
   AND p.key = ws.scan_type;

UPDATE work_sessions ws
   SET purpose_id = p.id
  FROM work_session_purposes p
 WHERE ws.purpose_id IS NULL
   AND p.organization_id = ws.organization_id
   AND ws.kind = 'task'
   AND p.key = COALESCE(ws.surface_key, 'support');

UPDATE work_sessions ws
   SET title = p.label
  FROM work_session_purposes p
 WHERE ws.title IS NULL
   AND ws.purpose_id = p.id;

COMMENT ON TABLE work_session_purposes IS
  'Org catalog of why a work session exists ("Unbox", "Front desk", "Staff assist"). DATA, never an enum (K12). Reporting groups by id, never by label. Archiving does not rewrite history — work_sessions.purpose_id is ON DELETE RESTRICT.';

COMMENT ON COLUMN work_session_purposes.key IS
  'Stable per-org identifier (unbox, staff-assist, custom slug). Not an enum. System keys match SCAN_SESSION_TYPES or a task bucket; custom keys are slugs of the label.';

COMMENT ON COLUMN work_session_purposes.label IS
  'Operator-facing name. Editable. Never GROUP BY this — A2.';

COMMENT ON COLUMN work_session_purposes.default_surface_key IS
  'SURFACE_REGISTRY key to open when this purpose starts, or NULL when the purpose has no bench (front desk, product triage). Validated in domain, not a DB FK — the registry is code.';

COMMENT ON COLUMN work_sessions.purpose_id IS
  'L1 bucket for this instance. NULL = untitled legacy row not yet backfilled. ON DELETE RESTRICT: archiving a purpose keeps every session that used it.';

COMMENT ON COLUMN work_sessions.notes IS
  'Running notes during the block. Not a clock. Empty of ops_events is legal.';

COMMENT ON COLUMN work_sessions.wrap_up IS
  'End-of-block recap: what changed (from → to) and why. Searchable. Duration is still Σ active intervals, never this text.';

COMMENT ON COLUMN work_sessions.wrap_up_source IS
  '''staff'' | ''assistant'' — who wrote wrap_up. NULL = none yet.';

COMMIT;
