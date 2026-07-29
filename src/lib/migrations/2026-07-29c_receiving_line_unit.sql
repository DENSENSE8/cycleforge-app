-- ============================================================================
-- 2026-07-29c_receiving_line_unit.sql
--
-- Per-unit "no serial" — Phase 0 (docs/todo/per-unit-no-serial-EXECUTION-PROMPT.md §3).
--
-- One row per *expected physical unit* on a receiving line. Materialises the thing
-- that already happens implicitly when a line-level serial_absent waiver bumps
-- quantity_received without creating serial_units rows — and gives each unit a
-- durable id to hang facts on (per-unit serial_absent, condition_grade that
-- survives reload, serial_unit_id linkage).
--
-- Identity vs display:
--   * id            — durable unit identity (never renumbered)
--   * ordinal       — display order only; renumbered when serials shift; NOT an identity
--   * serial_unit_id — optional link to a scanned serial_units row (SET NULL on delete)
--
-- Relationship to receiving_line_testing.serial_absent: that column STAYS and
-- keeps its whole-line meaning. This table is additive; no reader/writer in
-- Phase 0. Phases 1+ materialise rows lazily and wire the UI.
--
-- Contract notes (typed-fact / tenant-from-birth — polymorphic-tables.md where
-- applicable; this table is NOT polymorphic — single parent via real FK):
--   * organization_id UUID NOT NULL, no DEFAULT in raw DDL
--   * org-led unique/partial indexes
--   * real FK ON DELETE CASCADE to receiving_line; SET NULL to serial_units
--   * enforce_tenant_isolation in this birth migration
--
-- Safety gating: brand-new table, zero writers at author time. Phase 1's
-- ensureLineUnits will stamp organization_id and run under withTenantTransaction,
-- so FORCE RLS from birth is safe (empty table; loud-fail only bites on a write
-- that forgets org — which is the point).
--
-- ROLLBACK:
--   select relax_tenant_isolation('receiving_line_unit');
--   DROP TABLE IF EXISTS receiving_line_unit;
--
-- VERIFY (after apply): npm run tenancy:coverage ; \d receiving_line_unit
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS receiving_line_unit (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,              -- no DEFAULT; enforce_tenant_isolation() installs it
  receiving_line_id    INTEGER NOT NULL REFERENCES receiving_line(id) ON DELETE CASCADE,
  ordinal              INTEGER NOT NULL,           -- display order only; NOT an identity
  serial_unit_id       INTEGER REFERENCES serial_units(id) ON DELETE SET NULL,
  serial_absent        BOOLEAN NOT NULL DEFAULT false,
  serial_absent_reason TEXT,                       -- Class-D serial_absent_reason vocabulary (app-validated)
  condition_grade      condition_grade_enum,       -- nullable; survives reload (replaces local pendingGrade)
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Display order is unique per line; ordinal may be renumbered, id never moves.
CREATE UNIQUE INDEX IF NOT EXISTS ux_receiving_line_unit_ordinal
  ON receiving_line_unit (organization_id, receiving_line_id, ordinal);

-- One line-unit per serial (a serial cannot hang on two slots).
CREATE UNIQUE INDEX IF NOT EXISTS ux_receiving_line_unit_serial
  ON receiving_line_unit (organization_id, serial_unit_id)
  WHERE serial_unit_id IS NOT NULL;

-- Line open / ensureLineUnits lookup.
CREATE INDEX IF NOT EXISTS idx_receiving_line_unit_line
  ON receiving_line_unit (organization_id, receiving_line_id);

COMMENT ON TABLE receiving_line_unit IS
  'One row per expected physical unit on a receiving line. Durable id for per-unit serial_absent / condition_grade / serial linkage. ordinal is display-only. Plan: per-unit-no-serial-EXECUTION-PROMPT.md. Tenant-scoped from birth.';

COMMENT ON COLUMN receiving_line_unit.ordinal IS
  'Display order within the line (1-based). Renumbered when serials shift; never used as a durable identity — use id.';

COMMENT ON COLUMN receiving_line_unit.serial_unit_id IS
  'Optional link to a scanned serial_units row. SET NULL when the serial is deleted; the unit row and any waiver/grade survive.';

COMMENT ON COLUMN receiving_line_unit.serial_absent IS
  'Operator waived the serial for THIS unit (not the whole line). Line-level waiver remains on receiving_line_testing.serial_absent.';

COMMENT ON COLUMN receiving_line_unit.serial_absent_reason IS
  'Class-D serial_absent_reason vocabulary code for the per-unit waiver. App-layer validated; NULL when serial_absent is false.';

COMMENT ON COLUMN receiving_line_unit.condition_grade IS
  'Per-unit condition grade. Nullable until the operator picks one; survives reload (replaces ephemeral pendingGrade).';

-- Tenant-from-birth: loud-fail org default + FORCE RLS + canonical tenant_isolation policy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('receiving_line_unit');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — receiving_line_unit left without FORCE RLS';
  END IF;
END $$;

COMMIT;
