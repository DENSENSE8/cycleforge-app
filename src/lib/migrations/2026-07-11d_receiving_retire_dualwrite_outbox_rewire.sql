-- Retire the receiving dual-write triggers + rewire the search-outbox off moved columns.
--
-- What / why (Wave-3 writer inversion, applied AFTER the code inversion landed):
--   Writers now write receiving_triage / receiving_unbox / receiving_line_testing /
--   receiving_line_zoho directly; the spine's moved columns are no longer written.
--   1. The carton search-outbox UPDATE trigger watched received_at (moved to
--      receiving_triage.door_received_at) — recreate it without that column, and
--      add an enqueue trigger on receiving_triage so a door-scan still refreshes
--      the carton's search doc.
--   2. Drop trg_sync_receiving_street / trg_sync_receiving_line_facts and their
--      functions: with no spine writes of the mirrored columns they are inert, and
--      their bodies reference spine columns the next migration (…e_) drops — they
--      MUST go first or the drop would leave broken trigger functions armed.
--
-- Safety gating:
--   - Code inversion verified by grep + unit gates before this applies: zero
--     INSERT/UPDATE of moved columns against receiving_carton/receiving_line
--     outside the state machine's own (spine-staying) columns.
--   - The outbox rewrite preserves the exact WHEN(IS DISTINCT FROM) semantics for
--     every remaining watched column.
--
-- Rollback:
--   Re-run the trigger blocks of 2026-07-11_receiving_line_zoho_number_norm.sql
--   (line-facts fn+trigger) and 2026-07-05c_receiving_street_tables.sql (street
--   fn+trigger); recreate the outbox trigger with received_at from this header's
--   git history; DROP TRIGGER trg_enqueue_search_outbox_on_receiving_triage and
--   DROP FUNCTION fn_enqueue_search_outbox_receiving_street.
--
-- Verify after apply:
--   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_sync_receiving%';  -- 0 rows
--   UPDATE receiving_triage SET door_received_at = door_received_at WHERE false; -- parses
--   \d receiving_triage  -- shows trg_enqueue_search_outbox_on_receiving_triage

BEGIN;

-- ── 1. Carton outbox trigger: drop received_at from UPDATE OF + WHEN ─────────
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_receiving_upd ON receiving_carton;
CREATE TRIGGER trg_enqueue_search_outbox_on_receiving_upd
  AFTER UPDATE OF carrier, source_platform, intake_type, exception_code,
    zoho_purchaseorder_number, support_notes, zoho_notes, condition_grade,
    qa_status, shipment_id, zendesk_ticket
  ON receiving_carton
  FOR EACH ROW
  WHEN (
    old.carrier IS DISTINCT FROM new.carrier
    OR old.source_platform IS DISTINCT FROM new.source_platform
    OR old.intake_type IS DISTINCT FROM new.intake_type
    OR old.exception_code IS DISTINCT FROM new.exception_code
    OR old.zoho_purchaseorder_number IS DISTINCT FROM new.zoho_purchaseorder_number
    OR old.support_notes IS DISTINCT FROM new.support_notes
    OR old.zoho_notes IS DISTINCT FROM new.zoho_notes
    OR old.condition_grade IS DISTINCT FROM new.condition_grade
    OR old.qa_status IS DISTINCT FROM new.qa_status
    OR old.shipment_id IS DISTINCT FROM new.shipment_id
    OR old.zendesk_ticket IS DISTINCT FROM new.zendesk_ticket
  )
  EXECUTE FUNCTION fn_enqueue_entity_search_outbox('RECEIVING');

-- ── 2. Street-table outbox enqueue: door-scan freshness for RECEIVING docs ───
-- (build-search-text's received_at now sources from receiving_triage; the
--  generic fn keys on NEW.id, so the street table needs its own tiny fn that
--  keys on NEW.receiving_id. Conflict clause mirrors 2026-07-04a.)
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_receiving_street()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
  VALUES (NEW.organization_id, 'RECEIVING', NEW.receiving_id)
  ON CONFLICT (organization_id, entity_type, entity_id)
  WHERE processed_at IS NULL AND claimed_at IS NULL
  DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_receiving_triage ON receiving_triage;
CREATE TRIGGER trg_enqueue_search_outbox_on_receiving_triage
  AFTER INSERT OR UPDATE OF door_received_at
  ON receiving_triage
  FOR EACH ROW
  EXECUTE FUNCTION fn_enqueue_search_outbox_receiving_street();

-- ── 3. Retire the dual-write machinery ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_receiving_street ON receiving_carton;
DROP FUNCTION IF EXISTS fn_sync_receiving_street();

DROP TRIGGER IF EXISTS trg_sync_receiving_line_facts ON receiving_line;
DROP FUNCTION IF EXISTS fn_sync_receiving_line_facts();

COMMIT;
