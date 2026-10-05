-- 2026-10-04f_unit_prepack.sql
-- Per-serialized-unit prepack completion plus the exact kit-part decisions
-- made for that unit. The catalog BOM remains the template; these rows are
-- immutable snapshots of the operator's Included / Missing answers.

BEGIN;

ALTER TABLE serial_units
  ADD COLUMN IF NOT EXISTS prepacked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prepacked_by_staff_id INTEGER,
  ADD COLUMN IF NOT EXISTS prepack_location_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'serial_units_prepacked_by_staff_fk') THEN
    ALTER TABLE serial_units ADD CONSTRAINT serial_units_prepacked_by_staff_fk
      FOREIGN KEY (organization_id, prepacked_by_staff_id)
      REFERENCES staff (organization_id, id) ON DELETE SET NULL (prepacked_by_staff_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'serial_units_prepack_location_fk') THEN
    ALTER TABLE serial_units ADD CONSTRAINT serial_units_prepack_location_fk
      FOREIGN KEY (organization_id, prepack_location_id)
      REFERENCES locations (organization_id, id) ON DELETE SET NULL (prepack_location_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS serial_unit_prepack_contents (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  serial_unit_id  INTEGER NOT NULL REFERENCES serial_units(id) ON DELETE CASCADE,
  kit_part_id     INTEGER REFERENCES sku_kit_parts(id) ON DELETE SET NULL,
  component_name  TEXT NOT NULL,
  component_type  TEXT NOT NULL,
  qty_required    INTEGER NOT NULL DEFAULT 1,
  component_sku   TEXT,
  included        BOOLEAN NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT serial_unit_prepack_contents_type_chk
    CHECK (component_type IN ('REMOTE', 'CABLE', 'ACCESSORY', 'MANUAL', 'PACKAGING')),
  CONSTRAINT serial_unit_prepack_contents_qty_chk CHECK (qty_required > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_serial_unit_prepack_contents_part
  ON serial_unit_prepack_contents (organization_id, serial_unit_id, kit_part_id)
  WHERE kit_part_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_serial_unit_prepack_contents_unit
  ON serial_unit_prepack_contents (organization_id, serial_unit_id, id);

CREATE INDEX IF NOT EXISTS idx_serial_units_prepacked
  ON serial_units (organization_id, prepacked_at DESC)
  WHERE prepacked_at IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('serial_unit_prepack_contents');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — serial_unit_prepack_contents left without FORCE RLS';
  END IF;
END $$;

COMMENT ON COLUMN serial_units.prepacked_at IS
  'Set only by Finish on the unit prepack form; NULL means the unit is not prepacked.';
COMMENT ON TABLE serial_unit_prepack_contents IS
  'Per-unit Included/Missing snapshots copied from sku_kit_parts at prepack Finish; never decrements stock and never edits the catalog BOM.';

COMMIT;
