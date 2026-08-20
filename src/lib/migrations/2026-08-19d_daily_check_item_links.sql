-- 2026-08-19d_daily_check_item_links.sql
--
-- Typed connections on a daily-check item (Zendesk ticket, work order).
-- The inspector on Home → Daily shows these the way Unbox Displays show a
-- carton’s ticket — a real row, not a painted-on relationship.
--
-- Shape matches docs/rules/polymorphic-tables.md: entity_type + entity_id,
-- named CHECK, org-led unique index, tenant-from-birth.
-- Parent-delete integrity on the non-polymorphic side is a real FK to
-- daily_check_items. Zendesk tickets live off-box so there is no parent
-- table to trigger; work_orders (integer PK) get a delete trigger so a
-- retired WO cannot leave an orphan link.
--
-- Writers (lib/daily-checks/queries.ts via /api/daily-checks/items/[id]/links)
-- run inside withTenantTransaction and stamp organization_id on insert.
--
-- ROLLBACK:
--   SELECT relax_tenant_isolation('daily_check_item_links');
--   DROP TABLE IF EXISTS daily_check_item_links;
--
-- VERIFY:
--   \d+ daily_check_item_links
--   npm run tenancy:coverage

BEGIN;

CREATE TABLE IF NOT EXISTS daily_check_item_links (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  item_id         BIGINT NOT NULL REFERENCES daily_check_items(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       BIGINT NOT NULL,
  label           TEXT,
  created_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_check_item_links_label_len CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 200)
);

DO $$ BEGIN
  ALTER TABLE daily_check_item_links
    ADD CONSTRAINT daily_check_item_links_entity_type_chk
    CHECK (entity_type IN ('ZENDESK_TICKET', 'WORK_ORDER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_check_item_links_natural
  ON daily_check_item_links (organization_id, item_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_daily_check_item_links_item
  ON daily_check_item_links (organization_id, item_id);

CREATE INDEX IF NOT EXISTS idx_daily_check_item_links_entity
  ON daily_check_item_links (organization_id, entity_type, entity_id);

-- Work-order parent delete: drop links whose entity_id is that WO.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_orders') THEN
    CREATE OR REPLACE FUNCTION fn_delete_daily_check_item_links_on_work_order_delete()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      DELETE FROM daily_check_item_links
       WHERE entity_type = 'WORK_ORDER' AND entity_id = OLD.id;
      RETURN OLD;
    END
    $fn$;

    DROP TRIGGER IF EXISTS trg_delete_daily_check_item_links_on_work_order_delete ON work_orders;
    CREATE TRIGGER trg_delete_daily_check_item_links_on_work_order_delete
      BEFORE DELETE ON work_orders
      FOR EACH ROW
      EXECUTE FUNCTION fn_delete_daily_check_item_links_on_work_order_delete();
  ELSE
    RAISE NOTICE 'work_orders absent — daily_check_item_links WORK_ORDER deletes are application-enforced';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('daily_check_item_links');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — daily_check_item_links left without FORCE RLS';
  END IF;
END $$;

COMMIT;
