-- 2026-10-07_locations_putaway_intake_kind.sql
--
-- Directed putaway by receipt type. A rack or shelf (any `locations` row) may
-- be marked with the receiving Type that belongs on it — PO / RETURN /
-- TRADE_IN, the carton's Type pill — so Unbox can say "Place on the Return
-- rack → RK12-3". One rule per (org, receipt type) → one target location
-- (D365 location directives by work-order type; SAP putaway strategies).
-- The rule is an attribute ON the location row, like
-- locations.arrival_priority_tier — no rules table.
--
-- Vocabulary: PUTAWAY_INTAKE_KINDS in
-- src/lib/receiving/putaway-targets-contract.ts. NULL = no receipt type.
--
-- Readers/writers: src/lib/receiving/putaway-targets.ts
-- (GET/POST /api/receiving/putaway-targets). They fail soft when this column
-- is absent (42703 → reads: every type unlinked; writes: "not set up yet"),
-- so code may ship before this applies.
--
-- Safe now: additive, nullable, no default, no backfill — every existing row
-- reads NULL, so no behaviour changes on apply. `locations` is already
-- tenant-owned; the partial UNIQUE index leads with organization_id (one
-- target per type per org, never global) and covers only the handful of
-- linked rows. The CHECK is added in a guarded block so a re-run never
-- duplicates it.
--
-- Verify after apply:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'locations' AND column_name = 'putaway_intake_kind';
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'ux_locations_org_putaway_intake_kind';
--   Expected: UNIQUE ... (organization_id, putaway_intake_kind) WHERE (putaway_intake_kind IS NOT NULL).
--
-- Rollback:
--   DROP INDEX IF EXISTS ux_locations_org_putaway_intake_kind;
--   ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_putaway_intake_kind_check;
--   ALTER TABLE locations DROP COLUMN IF EXISTS putaway_intake_kind;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS putaway_intake_kind TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'locations_putaway_intake_kind_check'
       AND conrelid = 'locations'::regclass
  ) THEN
    ALTER TABLE locations
      ADD CONSTRAINT locations_putaway_intake_kind_check
      CHECK (putaway_intake_kind IN ('PO', 'RETURN', 'TRADE_IN'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_locations_org_putaway_intake_kind
  ON locations (organization_id, putaway_intake_kind)
  WHERE putaway_intake_kind IS NOT NULL;

COMMENT ON COLUMN locations.putaway_intake_kind IS
  'Directed-putaway receipt type this rack/shelf receives: PO | RETURN | TRADE_IN (src/lib/receiving/putaway-targets-contract.ts). One location per type per org (ux_locations_org_putaway_intake_kind). NULL = none. 2026-10-07.';
