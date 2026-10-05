-- ============================================================================
-- 2026-10-04e_support_search_docs.sql
--
-- SUPPORT_TICKET search docs follow the Support item (2026-10-04d): the doc
-- now indexes the requester (name / email / handle), account label, local
-- lifecycle, and everything the item links — orders (number, id, SKU,
-- tracking), repairs, shipments, ticket items' SKUs, pasted external
-- references (LOADER_SQL.SUPPORT_TICKET, src/lib/search/search-outbox-worker.ts).
-- So the outbox must also fire when those change:
--   • support_tickets UPDATE trigger watches the new columns too.
--   • ticket_links INSERT / UPDATE / DELETE re-enqueue the item(s) the link
--     belongs to (support_ticket_id, else the Zendesk number for rows written
--     before that seam), OLD and NEW both on UPDATE.
--   • support_ticket_items INSERT / DELETE re-enqueue their item.
-- Then every SUPPORT_TICKET doc is re-enqueued once so existing docs pick up
-- the new fields.
--
-- Depends on 2026-10-04d (columns lifecycle, requester_*, account_label,
-- primary_order_id, primary_task_id; ticket_links.external_reference) and
-- 2026-09-11a (fn_search_outbox_enqueue_one).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_ticket_links ON ticket_links;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_support_ticket_items ON support_ticket_items;
--   DROP FUNCTION IF EXISTS fn_search_outbox_enqueue_support_ticket_for_link();
--   DROP FUNCTION IF EXISTS fn_search_outbox_enqueue_support_ticket_for_item();
--   restore trg_enqueue_search_outbox_on_support_tickets_upd from 2026-09-12a.
--
-- VERIFY:
--   SELECT tgname FROM pg_trigger WHERE tgname IN (
--     'trg_enqueue_search_outbox_on_ticket_links',
--     'trg_enqueue_search_outbox_on_support_ticket_items',
--     'trg_enqueue_search_outbox_on_support_tickets_upd');
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_support_tickets_upd ON support_tickets;
CREATE TRIGGER trg_enqueue_search_outbox_on_support_tickets_upd
  AFTER UPDATE OF provider, external_ticket_id, subject_cache, status_cache,
                  lifecycle, requester_name, requester_email, requester_handle,
                  account_label, primary_order_id, primary_task_id
  ON support_tickets
  FOR EACH ROW
  WHEN (OLD.provider           IS DISTINCT FROM NEW.provider
     OR OLD.external_ticket_id IS DISTINCT FROM NEW.external_ticket_id
     OR OLD.subject_cache      IS DISTINCT FROM NEW.subject_cache
     OR OLD.status_cache       IS DISTINCT FROM NEW.status_cache
     OR OLD.lifecycle          IS DISTINCT FROM NEW.lifecycle
     OR OLD.requester_name     IS DISTINCT FROM NEW.requester_name
     OR OLD.requester_email    IS DISTINCT FROM NEW.requester_email
     OR OLD.requester_handle   IS DISTINCT FROM NEW.requester_handle
     OR OLD.account_label      IS DISTINCT FROM NEW.account_label
     OR OLD.primary_order_id   IS DISTINCT FROM NEW.primary_order_id
     OR OLD.primary_task_id    IS DISTINCT FROM NEW.primary_task_id)
  EXECUTE FUNCTION fn_enqueue_entity_search_outbox('SUPPORT_TICKET');

-- One ticket_links row → the Support item it belongs to.
CREATE OR REPLACE FUNCTION fn_search_outbox_enqueue_support_ticket_for_link()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM fn_search_outbox_enqueue_one(
      NEW.organization_id,
      'SUPPORT_TICKET',
      COALESCE(
        NEW.support_ticket_id,
        (SELECT st.id FROM support_tickets st
          WHERE st.organization_id = NEW.organization_id
            AND st.provider = 'zendesk'
            AND st.external_ticket_id = NEW.zendesk_ticket_id::text
          LIMIT 1)));
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM fn_search_outbox_enqueue_one(
      OLD.organization_id,
      'SUPPORT_TICKET',
      COALESCE(
        OLD.support_ticket_id,
        (SELECT st.id FROM support_tickets st
          WHERE st.organization_id = OLD.organization_id
            AND st.provider = 'zendesk'
            AND st.external_ticket_id = OLD.zendesk_ticket_id::text
          LIMIT 1)));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_ticket_links ON ticket_links;
CREATE TRIGGER trg_enqueue_search_outbox_on_ticket_links
  AFTER INSERT OR UPDATE OR DELETE ON ticket_links
  FOR EACH ROW EXECUTE FUNCTION fn_search_outbox_enqueue_support_ticket_for_link();

CREATE OR REPLACE FUNCTION fn_search_outbox_enqueue_support_ticket_for_item()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_search_outbox_enqueue_one(OLD.organization_id, 'SUPPORT_TICKET', OLD.support_ticket_id);
  ELSE
    PERFORM fn_search_outbox_enqueue_one(NEW.organization_id, 'SUPPORT_TICKET', NEW.support_ticket_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_support_ticket_items ON support_ticket_items;
CREATE TRIGGER trg_enqueue_search_outbox_on_support_ticket_items
  AFTER INSERT OR DELETE ON support_ticket_items
  FOR EACH ROW EXECUTE FUNCTION fn_search_outbox_enqueue_support_ticket_for_item();

-- Re-enqueue through the OUTBOX only (the worker builds every doc).
INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT st.organization_id, 'SUPPORT_TICKET', st.id
  FROM support_tickets st
ON CONFLICT (organization_id, entity_type, entity_id)
WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

COMMIT;
