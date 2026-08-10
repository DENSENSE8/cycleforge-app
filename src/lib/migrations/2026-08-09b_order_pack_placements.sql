-- ============================================================================
-- 2026-08-09b: order_pack_placements + events — current packing-station place
-- ============================================================================
-- Current-state fact: which packing DESK / packing-room STAGING location holds
-- each open labeled outbound order after Ready-to-Pack TESTED handoff.
-- Events table is append-only move/place audit for cheap GROUP BY history.
--
-- Tenant-scoped from birth. Writers (pack-placement domain + tech scan / move
-- routes) run inside withTenantTransaction and stamp organization_id.
--
-- ROLLBACK:
--   SELECT relax_tenant_isolation('order_pack_placement_events');
--   SELECT relax_tenant_isolation('order_pack_placements');
--   DROP TABLE IF EXISTS order_pack_placement_events;
--   DROP TABLE IF EXISTS order_pack_placements;
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_pack_placements (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  location_id     INTEGER NOT NULL REFERENCES locations(id),
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  placed_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  source          TEXT NOT NULL DEFAULT 'tech_scan',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_pack_placements_org_order_unique UNIQUE (organization_id, order_id),
  CONSTRAINT order_pack_placements_source_check CHECK (
    source IN ('tech_scan', 'move', 'admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_order_pack_placements_org_location
  ON order_pack_placements (organization_id, location_id);

CREATE INDEX IF NOT EXISTS idx_order_pack_placements_org_placed
  ON order_pack_placements (organization_id, placed_at DESC);

CREATE TABLE IF NOT EXISTS order_pack_placement_events (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_location_id INTEGER REFERENCES locations(id),
  to_location_id  INTEGER NOT NULL REFERENCES locations(id),
  staff_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  source          TEXT NOT NULL DEFAULT 'move',
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_pack_placement_events_source_check CHECK (
    source IN ('tech_scan', 'move', 'admin', 'clear')
  )
);

CREATE INDEX IF NOT EXISTS idx_order_pack_placement_events_org_order
  ON order_pack_placement_events (organization_id, order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_pack_placement_events_org_created
  ON order_pack_placement_events (organization_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_pack_placements');
    PERFORM enforce_tenant_isolation('order_pack_placement_events');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_pack_placements left without FORCE RLS';
  END IF;
END $$;
