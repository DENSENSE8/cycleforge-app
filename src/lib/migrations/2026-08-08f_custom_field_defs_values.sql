-- 2026-08-08f: custom_field_defs + custom_field_values — typed org custom columns (S3).
--
-- Wave-1 storage for Horizon C / universal-table-connector plan. Typed value
-- columns (not a JSONB blob on orders / receiving_line). One aggregated join
-- hydrates a jsonb map at read time — never N joins per field.
--
-- polymorphic-tables.md: entity_type TEXT + named CHECK; entity_id BIGINT
-- (orders.id serial + receiving_line.id integer); org-led unique keys;
-- parent-delete triggers for EVERY discriminator value in THIS migration;
-- tenant-from-birth via enforce_tenant_isolation().
--
-- Writers: src/lib/custom-fields/* inside withTenantTransaction, stamping
-- organization_id explicitly. Safe to FORCE RLS from birth.
--
-- ROLLBACK:
--   DROP TRIGGER trg_delete_custom_field_values_on_orders;
--   DROP TRIGGER trg_delete_custom_field_values_on_receiving_line;
--   DROP FUNCTION IF EXISTS fn_delete_custom_field_values_on_parent_delete();
--   SELECT relax_tenant_isolation('custom_field_values');
--   SELECT relax_tenant_isolation('custom_field_defs');
--   DROP TABLE IF EXISTS custom_field_values, custom_field_defs;
--
-- VERIFY:
--   INSERT a def + value under withTenantTransaction; SELECT hydrate map;
--   DELETE FROM orders WHERE id = … → values for that ORDER entity_id gone.

BEGIN;

CREATE TABLE IF NOT EXISTS custom_field_defs (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  entity_type     TEXT NOT NULL,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  type            TEXT NOT NULL,
  options         JSONB,
  sort_order      INT NOT NULL DEFAULT 0,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT custom_field_defs_entity_type_chk
    CHECK (entity_type IN ('ORDER', 'RECEIVING')),
  CONSTRAINT custom_field_defs_type_chk
    CHECK (type IN ('text', 'number', 'date', 'select', 'boolean')),
  CONSTRAINT custom_field_defs_key_chk
    CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_custom_field_defs_org_entity_key
  ON custom_field_defs (organization_id, entity_type, key);

CREATE INDEX IF NOT EXISTS idx_custom_field_defs_org_entity_live
  ON custom_field_defs (organization_id, entity_type, sort_order)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS custom_field_values (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  field_id        BIGINT NOT NULL REFERENCES custom_field_defs(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       BIGINT NOT NULL,
  value_text      TEXT,
  value_number    NUMERIC,
  value_date      DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT custom_field_values_entity_type_chk
    CHECK (entity_type IN ('ORDER', 'RECEIVING')),
  CONSTRAINT custom_field_values_one_value_chk
    CHECK (
      (value_text IS NOT NULL)::int
      + (value_number IS NOT NULL)::int
      + (value_date IS NOT NULL)::int
      = 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_custom_field_values_org_field_entity
  ON custom_field_values (organization_id, field_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_org_entity
  ON custom_field_values (organization_id, entity_type, entity_id);

-- Parent-delete: wipe values when the parent row goes (defs stay — archive is
-- the operator path for retiring a column).
CREATE OR REPLACE FUNCTION fn_delete_custom_field_values_on_parent_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM custom_field_values
  WHERE organization_id = OLD.organization_id
    AND entity_type = TG_ARGV[0]
    AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_custom_field_values_on_orders ON orders;
CREATE TRIGGER trg_delete_custom_field_values_on_orders
  AFTER DELETE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_delete_custom_field_values_on_parent_delete('ORDER');

DROP TRIGGER IF EXISTS trg_delete_custom_field_values_on_receiving_line ON receiving_line;
CREATE TRIGGER trg_delete_custom_field_values_on_receiving_line
  AFTER DELETE ON receiving_line
  FOR EACH ROW
  EXECUTE FUNCTION fn_delete_custom_field_values_on_parent_delete('RECEIVING');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('custom_field_defs');
    PERFORM enforce_tenant_isolation('custom_field_values');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — custom_field_* left without FORCE RLS';
  END IF;
END $$;

COMMIT;
