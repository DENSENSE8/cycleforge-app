-- 2026-08-24_unit_location_spine.sql
-- The v1 location spine, expand step (00-endgame §2/§6, D1): give every serial
-- unit a REAL location reference, and record placement and parts-pull FACTS so
-- "where is it, where did it come from, what's been pulled from it" is
-- answerable and true. Today serial_units.current_location is bare TEXT and no
-- table records a disassembly — this is the gap the endgame names as the build.
--
-- Three pieces, one spine:
--   1. serial_units.location_id — nullable FK to locations. The "where is it
--      NOW" pointer, maintained by the domain writer in the same transaction
--      as a placement row.
--   2. unit_placements — the fact log. One row per physical put-away: which
--      unit, into which location, evidenced by which scans, by whom, inside
--      which work session.
--   3. part_pulls — the disassembly log. One row per part pulled out of a
--      donor unit into a (parts) bin. quantity for unserialised parts;
--      part_serial_unit_id when the pulled part is re-registered as its own
--      unit.
--
-- THE LAW IN THE DDL (00-endgame D10, operator ruling 2026-08-24): "a location
-- is a fact created by a scan, and only a scan." location_scan_source is
-- CHECK-limited to ('scanner','camera') — a typed or pasted location cannot be
-- written at the SQL layer, not merely refused in the domain layer. The AI has
-- no write path here at all; it may only queue reconciliation checks.
-- Identifying the UNIT may be any input source ('scanner','camera','paste',
-- 'human') — serials get typed when a label is damaged; the vocabulary is the
-- Phase-1 input truth layer's (find-field-scan.ts FindFieldSource) plus
-- 'camera' for the mobile put-away path (D4/D5).
--
-- NO BACKFILL from serial_units.current_location, deliberately. That TEXT was
-- never scan-created; projecting it into location_id would mint exactly the
-- unverified "facts" this spine exists to end. The TEXT column stays readable
-- as the legacy claim until each unit is re-scanned into truth; the contract
-- step retires it once placements cover live stock.
--
-- SESSION ATTRIBUTION mirrors ops_events (2026-08-23b): session_id BIGINT
-- ON DELETE SET NULL + denormalised session_type with NO CHECK — same
-- deliberate departure, same reason (the bench vocabulary widens without a
-- migration). client_event_id gives the flaky-network mobile writer an
-- idempotency key, unique per org.
--
-- SAFETY GATING: purely additive expand — a nullable ADD COLUMN and two new
-- tables with no readers or writers yet. The only writers will be the new
-- placements domain module, which runs under withTenantTransaction AND stamps
-- organization_id explicitly, so both tables are enforced tenant-from-birth
-- (same shot as serial_unit_provenance, work_sessions). RLS stays inert under
-- the owner role; the loud-fail default is the immediate backstop.
--
-- ROLLBACK:
--   select relax_tenant_isolation('unit_placements');
--   select relax_tenant_isolation('part_pulls');
--   DROP TABLE IF EXISTS part_pulls;
--   DROP TABLE IF EXISTS unit_placements;
--   ALTER TABLE serial_units DROP COLUMN IF EXISTS location_id;
--
-- VERIFY after apply:
--   \d unit_placements   → org-led indexes, FORCE RLS, tenant_isolation policy
--   INSERT with location_scan_source='human' must fail the named CHECK.
--   npm run tenancy:coverage   → both tables report org_id + RLS + FORCE.

BEGIN;

-- ─── 1 · The pointer: where is this unit NOW ────────────────────────────────

ALTER TABLE serial_units
  ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;

COMMENT ON COLUMN serial_units.location_id IS
  'Current physical location (FK). Written ONLY by the placements domain writer, in the same transaction as its unit_placements row — never directly. NULL = no scan-created placement yet (current_location TEXT is the unverified legacy claim).';

-- "What is in this bin" — the everyday floor read.
CREATE INDEX IF NOT EXISTS idx_serial_units_org_location
  ON serial_units (organization_id, location_id)
  WHERE location_id IS NOT NULL;

-- ─── 2 · The fact log: unit_placements ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS unit_placements (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,  -- no DEFAULT; helper installs the loud-fail GUC default
  serial_unit_id       INTEGER NOT NULL REFERENCES serial_units(id) ON DELETE CASCADE,
  location_id          INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  previous_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  placed_by            INTEGER,        -- staff id; nullable for device-principal writers (kiosk)
  unit_scan_source     TEXT NOT NULL,
  location_scan_source TEXT NOT NULL,
  session_id           BIGINT REFERENCES work_sessions(id) ON DELETE SET NULL,
  session_type         TEXT,           -- denormalised beside the id; outlives the session row
  client_event_id      TEXT,           -- mobile idempotency key
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unit_placements_unit_scan_source_chk
    CHECK (unit_scan_source IN ('scanner','camera','paste','human')),
  -- The D10 law: a location fact exists only by scan.
  CONSTRAINT unit_placements_location_scan_source_chk
    CHECK (location_scan_source IN ('scanner','camera'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_unit_placements_client_event
  ON unit_placements (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

-- Unit history: "where has this unit been" (newest first).
CREATE INDEX IF NOT EXISTS idx_unit_placements_org_unit
  ON unit_placements (organization_id, serial_unit_id, occurred_at DESC);

-- Bin history: "what has landed in this location" (newest first).
CREATE INDEX IF NOT EXISTS idx_unit_placements_org_location
  ON unit_placements (organization_id, location_id, occurred_at DESC);

COMMENT ON TABLE unit_placements IS
  'Scan-created placement facts for serial units (00-endgame D1/D10). One row per physical put-away; serial_units.location_id is maintained in the same transaction. location_scan_source is CHECK-limited to scanner/camera — the "only a scan" law, DB-enforced. Tenant-scoped from birth.';

-- ─── 3 · The disassembly log: part_pulls ────────────────────────────────────

CREATE TABLE IF NOT EXISTS part_pulls (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,  -- no DEFAULT; helper installs the loud-fail GUC default
  donor_serial_unit_id INTEGER NOT NULL REFERENCES serial_units(id) ON DELETE CASCADE,
  part_label           TEXT NOT NULL,  -- the org's own words ("battery", "grille") — data, not code
  part_sku             TEXT,           -- when the part maps to a sellable SKU
  part_serial_unit_id  INTEGER REFERENCES serial_units(id) ON DELETE SET NULL,
  quantity             INTEGER NOT NULL DEFAULT 1,
  to_location_id       INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  pulled_by            INTEGER,        -- staff id
  donor_scan_source    TEXT NOT NULL,
  location_scan_source TEXT NOT NULL,
  session_id           BIGINT REFERENCES work_sessions(id) ON DELETE SET NULL,
  session_type         TEXT,
  client_event_id      TEXT,
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT part_pulls_quantity_chk CHECK (quantity > 0),
  CONSTRAINT part_pulls_donor_scan_source_chk
    CHECK (donor_scan_source IN ('scanner','camera','paste','human')),
  CONSTRAINT part_pulls_location_scan_source_chk
    CHECK (location_scan_source IN ('scanner','camera'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_part_pulls_client_event
  ON part_pulls (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

-- "What's been pulled from it" — the endgame's third question, per donor unit.
CREATE INDEX IF NOT EXISTS idx_part_pulls_org_donor
  ON part_pulls (organization_id, donor_serial_unit_id, occurred_at DESC);

-- Parts-bin contents trail.
CREATE INDEX IF NOT EXISTS idx_part_pulls_org_location
  ON part_pulls (organization_id, to_location_id, occurred_at DESC);

COMMENT ON TABLE part_pulls IS
  'Disassembly facts (00-endgame §2): parts pulled from a donor serial unit into a bin, scan-evidenced. quantity for unserialised parts; part_serial_unit_id when the part is re-registered as its own unit. Tenant-scoped from birth.';

-- ─── Tenant enforcement (both new tables; writers stamp org from birth) ─────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('unit_placements');
    PERFORM enforce_tenant_isolation('part_pulls');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — unit_placements/part_pulls left without FORCE RLS';
  END IF;
END $$;

COMMIT;
