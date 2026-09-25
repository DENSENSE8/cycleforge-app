-- 2026-09-25b_work_assignment_links.sql
--
-- The records a thrown task names BEYOND its anchor. `work_assignments`
-- carries exactly one (entity_type, entity_id) — the record the task is about.
-- An operator working a return holds more handles than that: the replacement
-- order, two tracking numbers, the Zendesk thread. One row per handle here,
-- keyed by the face the operator quotes (`label`), so the natural key
-- (org, task, kind, label) dedupes two operators linking the same thing.
--
--   entity_type  | entity_id                       | label
--   -------------+---------------------------------+----------------------------------
--   ORDER        | orders.id (one line)            | orders.order_id, or 'ID <orders.id>'
--   SUPPORT_TICKET | LOCAL support_tickets.id      | the provider ticket number (digits)
--   TRACKING     | NULL                            | canonical tracking number
--
-- A TRACKING link has no parent row of its own (a carrier number may predate
-- or never get a `shipping_tracking_numbers` row); `resolved_order_id` keeps
-- the order `findOrderByTrackingKey` matched at link time, SET NULL when that
-- order goes.
--
-- Shape follows docs/rules/polymorphic-tables.md (the 2026-08-19d
-- daily_check_item_links precedent): named discriminator CHECK, org-led
-- indexes, real FK on the non-polymorphic side (work_assignments, CASCADE),
-- and parent-delete triggers for the two polymorphic parents (orders,
-- support_tickets) so a deleted record never leaves a dangling link.
--
-- SAFETY: new table, tenant-from-birth. The only writer
-- (src/lib/tasks/task-links-db.ts via /api/tasks/[id]/links) runs inside
-- withTenantTransaction and stamps organization_id from the auth context, so
-- the loud-fail org default and FORCE RLS are safe from day one. The parent
-- delete triggers filter on OLD.organization_id and so stay inside the
-- deleting row's tenant.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_delete_work_assignment_links_on_order_delete ON orders;
--   DROP TRIGGER IF EXISTS trg_delete_work_assignment_links_on_support_ticket_delete ON support_tickets;
--   DROP FUNCTION IF EXISTS fn_delete_work_assignment_links_on_parent_delete();
--   SELECT relax_tenant_isolation('work_assignment_links');
--   DROP TABLE IF EXISTS work_assignment_links;
--
-- VERIFY:
--   \d+ work_assignment_links
--   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_delete_work_assignment_links_%';
--   npm run tenancy:coverage

BEGIN;

CREATE TABLE IF NOT EXISTS work_assignment_links (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  assignment_id       INTEGER NOT NULL REFERENCES work_assignments(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL,
  entity_id           BIGINT,
  label               TEXT NOT NULL,
  resolved_order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_assignment_links_label_len CHECK (char_length(label) BETWEEN 1 AND 200)
);

DO $$ BEGIN
  ALTER TABLE work_assignment_links
    ADD CONSTRAINT work_assignment_links_entity_type_chk
    CHECK (
      (entity_type IN ('ORDER', 'SUPPORT_TICKET') AND entity_id IS NOT NULL)
      OR (entity_type = 'TRACKING' AND entity_id IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_assignment_links
    ADD CONSTRAINT work_assignment_links_natural_uq
    UNIQUE (organization_id, assignment_id, entity_type, label);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_work_assignment_links_assignment
  ON work_assignment_links (organization_id, assignment_id);

CREATE INDEX IF NOT EXISTS idx_work_assignment_links_entity
  ON work_assignment_links (organization_id, entity_type, entity_id);

-- Polymorphic parent delete: drop the links that name the deleted row. One
-- function, the entity_type passed as TG_ARGV[0] (the same dispatch shape as
-- fn_delete_photos_on_parent_delete).
CREATE OR REPLACE FUNCTION fn_delete_work_assignment_links_on_parent_delete()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  DELETE FROM work_assignment_links
   WHERE organization_id = OLD.organization_id
     AND entity_type = TG_ARGV[0]
     AND entity_id = OLD.id;
  RETURN OLD;
END
$fn$;

DROP TRIGGER IF EXISTS trg_delete_work_assignment_links_on_order_delete ON orders;
CREATE TRIGGER trg_delete_work_assignment_links_on_order_delete
  BEFORE DELETE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_delete_work_assignment_links_on_parent_delete('ORDER');

DROP TRIGGER IF EXISTS trg_delete_work_assignment_links_on_support_ticket_delete ON support_tickets;
CREATE TRIGGER trg_delete_work_assignment_links_on_support_ticket_delete
  BEFORE DELETE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION fn_delete_work_assignment_links_on_parent_delete('SUPPORT_TICKET');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_assignment_links');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_assignment_links left without FORCE RLS';
  END IF;
END $$;

COMMIT;
