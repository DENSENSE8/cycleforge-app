-- 2026-10-03_locations_org_scoped_identity.sql
--
-- WHAT / WHY
--   Movable racks (docs/handoff/HANDOFF-room-agnostic-racks-2026-10-03.md, D4).
--   1. `locations.barcode` and `locations.name` were GLOBALLY unique
--      (constraints `locations_barcode_key`, `locations_name_key`), so two
--      organizations could never both own `RK1`, `H-12` or `Rack 1`. Identity
--      is per tenant: replace both with unique indexes leading with
--      organization_id — `locations_org_barcode_key (organization_id, barcode)`
--      and `locations_org_name_key (organization_id, name)`. They are plain
--      (non-partial) so `ON CONFLICT (organization_id, barcode)` infers them;
--      NULL barcodes stay distinct as before.
--   2. Rack events (`location.rack.created|moved`, `location.labels.printed`)
--      are written to ops_events with entity_type 'location'. Replace
--      `ops_events_entity_type_chk` with the same list plus 'location'
--      (mirrors OPS_EVENT_ENTITY_TYPES in src/lib/ops-event-types.ts; pinned by
--      src/lib/ops-events.test.ts, which reads the newest migration that
--      defines this CHECK).
--
-- SAFETY
--   - Live audit 2026-10-03: zero (organization_id, barcode) and zero
--     (organization_id, name) duplicates (the global keys made them
--     impossible), so the new unique indexes build without conflict.
--   - Every row in ops_events already carries one of the 9 existing values, a
--     strict subset of the new list, so the replaced CHECK validates.
--   - The only code conflict target on the old key, `ON CONFLICT (barcode)` in
--     registerPrintedLocations (src/lib/neon/location-queries.ts), moves to
--     `ON CONFLICT (organization_id, barcode)` in the same change set.
--   - The new indexes are created BEFORE the old constraints drop, inside one
--     transaction, so uniqueness is never unenforced. locations is ~600 rows
--     and ops_events ~26k rows: locks hold for milliseconds (runner sets
--     lock_timeout). Idempotent: IF [NOT] EXISTS throughout.
--
-- ROLLBACK (only valid while no two orgs share a barcode/name)
--   ALTER TABLE locations ADD CONSTRAINT locations_barcode_key UNIQUE (barcode);
--   ALTER TABLE locations ADD CONSTRAINT locations_name_key UNIQUE (name);
--   DROP INDEX IF EXISTS locations_org_barcode_key;
--   DROP INDEX IF EXISTS locations_org_name_key;
--   ALTER TABLE ops_events DROP CONSTRAINT IF EXISTS ops_events_entity_type_chk;
--   ALTER TABLE ops_events ADD CONSTRAINT ops_events_entity_type_chk
--     CHECK (entity_type IN ('receiving','receiving_line','serial_unit','shipment','order','fba_shipment','repair','warranty_claim','other'));
--   (fails while any entity_type = 'location' row exists — ops_events is append-only.)
--
-- VERIFY
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'locations'::regclass
--      AND conname IN ('locations_barcode_key', 'locations_name_key');      -- 0 rows
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'locations'
--      AND indexname IN ('locations_org_barcode_key', 'locations_org_name_key'); -- 2 rows
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'ops_events_entity_type_chk';                         -- includes 'location'

CREATE UNIQUE INDEX IF NOT EXISTS locations_org_barcode_key
  ON locations (organization_id, barcode);

CREATE UNIQUE INDEX IF NOT EXISTS locations_org_name_key
  ON locations (organization_id, name);

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_barcode_key;
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_name_key;

-- Single-line value list on purpose: ops-events.test.ts parses it.
ALTER TABLE ops_events DROP CONSTRAINT IF EXISTS ops_events_entity_type_chk;
ALTER TABLE ops_events ADD CONSTRAINT ops_events_entity_type_chk
  CHECK (entity_type IN ('receiving','receiving_line','serial_unit','shipment','order','fba_shipment','repair','warranty_claim','other','location'));
