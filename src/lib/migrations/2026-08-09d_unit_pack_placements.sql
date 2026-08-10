-- ============================================================================
-- 2026-08-09c: unit_pack_placements + events — current packing-station place
--              for a loose SERIAL UNIT (Phase 2, sibling of order placement)
-- ============================================================================
-- Current-state fact: which packing DESK / packing-room STAGING location holds
-- each loose serialized unit staged at Ready-to-Pack (units NOT (yet) tied to a
-- labeled order). Sibling of order_pack_placements (2026-08-09b) — shares the
-- same `locations` DESK/STAGING benches, its own ledger so order vs unit counts
-- stay distinct (no double-count when a unit's parent order is also on a bench).
--
-- This is WIP staging, NOT stock putaway: serial_units.current_location +
-- inventory_events(MOVED) remain the bin-putaway path and are untouched here.
--
-- Single non-polymorphic parent (serial_units) → a real FK ON DELETE CASCADE is
-- the preferred integrity per polymorphic-tables.md (no trigger family needed).
-- `unit_id` is INTEGER to match serial_units.id (SERIAL/int4); the table's own
-- PK is BIGSERIAL like its order sibling.
--
-- Tenant-scoped from birth. Writers (unit-pack-placement domain + the
-- units/pack-placement routes) run inside withTenantTransaction and stamp
-- organization_id.
--
-- ROLLBACK:
--   SELECT relax_tenant_isolation('unit_pack_placement_events');
--   SELECT relax_tenant_isolation('unit_pack_placements');
--   DROP TABLE IF EXISTS unit_pack_placement_events;
--   DROP TABLE IF EXISTS unit_pack_placements;
-- ============================================================================

CREATE TABLE IF NOT EXISTS unit_pack_placements (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  unit_id         INTEGER NOT NULL REFERENCES serial_units(id) ON DELETE CASCADE,
  location_id     INTEGER NOT NULL REFERENCES locations(id),
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  placed_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  source          TEXT NOT NULL DEFAULT 'tech_scan',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unit_pack_placements_org_unit_unique UNIQUE (organization_id, unit_id),
  CONSTRAINT unit_pack_placements_source_check CHECK (
    source IN ('tech_scan', 'move', 'admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_unit_pack_placements_org_location
  ON unit_pack_placements (organization_id, location_id);

CREATE INDEX IF NOT EXISTS idx_unit_pack_placements_org_placed
  ON unit_pack_placements (organization_id, placed_at DESC);

CREATE TABLE IF NOT EXISTS unit_pack_placement_events (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  unit_id         INTEGER NOT NULL REFERENCES serial_units(id) ON DELETE CASCADE,
  from_location_id INTEGER REFERENCES locations(id),
  to_location_id  INTEGER NOT NULL REFERENCES locations(id),
  staff_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  source          TEXT NOT NULL DEFAULT 'move',
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unit_pack_placement_events_source_check CHECK (
    source IN ('tech_scan', 'move', 'admin', 'clear')
  )
);

CREATE INDEX IF NOT EXISTS idx_unit_pack_placement_events_org_unit
  ON unit_pack_placement_events (organization_id, unit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_unit_pack_placement_events_org_created
  ON unit_pack_placement_events (organization_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('unit_pack_placements');
    PERFORM enforce_tenant_isolation('unit_pack_placement_events');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — unit_pack_placements left without FORCE RLS';
  END IF;
END $$;
