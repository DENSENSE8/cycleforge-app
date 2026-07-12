-- receiving_line_zoho: add zoho_purchaseorder_number_norm (Wave-2 reader-cutover gap).
--
-- What / why:
--   The Wave-2 reader cutover points every zoho-cluster read at receiving_line_zoho,
--   but the normalized PO join key `zoho_purchaseorder_number_norm` (used to join
--   receiving lines to zoho_po_mirror in the incoming/delivered surfaces) was never
--   projected into the facts table by 2026-06-29c/e — readers of it were stuck on the
--   spine column, which is slated to drop in the §8 step-13 wave. This migration:
--     1. adds the column to receiving_line_zoho,
--     2. backfills it from the spine (idempotent),
--     3. re-publishes fn_sync_receiving_line_facts to mirror it (and widens the
--        zoho-row predicate to any zoho_purchaseorder_number(_norm) presence —
--        belt-and-braces; live data has 0 lines with a number but no id),
--     4. re-creates trg_sync_receiving_line_facts with the column in UPDATE OF,
--     5. adds an org-led index for the mirror-join lookups.
--
-- Safety gating (verified live 2026-07-11):
--   - 0 lines with ANY zoho field lack a receiving_line_zoho row, so backfilling
--     only existing rz rows loses nothing; the widened predicate covers future
--     number-only writers.
--   - The trigger function keeps the 29e EXCEPTION-guarded, AFTER-row, best-effort
--     shape verbatim; only the zoho column list/predicate changed.
--
-- Rollback:
--   ALTER TABLE receiving_line_zoho DROP COLUMN IF EXISTS zoho_purchaseorder_number_norm;
--   then re-run the 2026-07-05c CREATE OR REPLACE of fn_sync_receiving_line_facts
--   (the previous published body) + its trigger.
--
-- Verify after apply:
--   SELECT COUNT(*) FROM receiving_line rl JOIN receiving_line_zoho rz
--     ON rz.receiving_line_id = rl.id
--   WHERE rz.zoho_purchaseorder_number_norm IS DISTINCT FROM rl.zoho_purchaseorder_number_norm;
--   -- expect 0

BEGIN;

ALTER TABLE receiving_line_zoho
  ADD COLUMN IF NOT EXISTS zoho_purchaseorder_number_norm text;

-- One-time idempotent backfill from the spine (the spine is still the written-first
-- source until the Wave-3 writer inversion; the trigger keeps it in sync after this).
UPDATE receiving_line_zoho rz
   SET zoho_purchaseorder_number_norm = rl.zoho_purchaseorder_number_norm,
       updated_at = now()
  FROM receiving_line rl
 WHERE rl.id = rz.receiving_line_id
   AND rz.zoho_purchaseorder_number_norm IS DISTINCT FROM rl.zoho_purchaseorder_number_norm;

-- Re-publish the dual-write function (full body; changes vs 2026-07-05c are the
-- number_norm column in the zoho upsert and the widened zoho-row predicate).
CREATE OR REPLACE FUNCTION fn_sync_receiving_line_facts() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    -- ── testing facts (universal: every line carries qa/disposition routing) ──
    INSERT INTO receiving_line_testing (
      receiving_line_id, organization_id, needs_test, assigned_tech_id,
      qa_status, disposition_code, condition_grade, disposition_final,
      disposition_audit, condition_set_at)
    VALUES (
      NEW.id, NEW.organization_id, NEW.needs_test, NEW.assigned_tech_id,
      NEW.qa_status, NEW.disposition_code, NEW.condition_grade, NEW.disposition_final,
      COALESCE(NEW.disposition_audit, '[]'::jsonb), NEW.condition_set_at)
    ON CONFLICT (receiving_line_id) DO UPDATE SET
      needs_test        = EXCLUDED.needs_test,
      assigned_tech_id  = EXCLUDED.assigned_tech_id,
      qa_status         = EXCLUDED.qa_status,
      disposition_code  = EXCLUDED.disposition_code,
      condition_grade   = EXCLUDED.condition_grade,
      disposition_final = EXCLUDED.disposition_final,
      disposition_audit = EXCLUDED.disposition_audit,
      condition_set_at  = EXCLUDED.condition_set_at,
      updated_at        = now();

    -- ── zoho facts (only Zoho-origin lines; predicate widened to number(_norm)) ──
    IF NEW.zoho_purchaseorder_id IS NOT NULL
       OR NEW.zoho_purchase_receive_id IS NOT NULL
       OR NEW.zoho_purchaseorder_number IS NOT NULL
       OR NEW.zoho_purchaseorder_number_norm IS NOT NULL
       OR NEW.unit_price IS NOT NULL
       OR NEW.zoho_notes IS NOT NULL THEN
      INSERT INTO receiving_line_zoho (
        receiving_line_id, organization_id, zoho_item_id, zoho_line_item_id,
        zoho_purchase_receive_id, zoho_purchaseorder_id, zoho_purchaseorder_number,
        zoho_purchaseorder_number_norm,
        zoho_sync_source, zoho_last_modified_time, zoho_synced_at, zoho_notes, unit_price)
      VALUES (
        NEW.id, NEW.organization_id, NEW.zoho_item_id, NEW.zoho_line_item_id,
        NEW.zoho_purchase_receive_id, NEW.zoho_purchaseorder_id, NEW.zoho_purchaseorder_number,
        NEW.zoho_purchaseorder_number_norm,
        NEW.zoho_sync_source, NEW.zoho_last_modified_time, NEW.zoho_synced_at, NEW.zoho_notes, NEW.unit_price)
      ON CONFLICT (receiving_line_id) DO UPDATE SET
        zoho_item_id             = EXCLUDED.zoho_item_id,
        zoho_line_item_id        = EXCLUDED.zoho_line_item_id,
        zoho_purchase_receive_id = EXCLUDED.zoho_purchase_receive_id,
        zoho_purchaseorder_id    = EXCLUDED.zoho_purchaseorder_id,
        zoho_purchaseorder_number = EXCLUDED.zoho_purchaseorder_number,
        zoho_purchaseorder_number_norm = EXCLUDED.zoho_purchaseorder_number_norm,
        zoho_sync_source         = EXCLUDED.zoho_sync_source,
        zoho_last_modified_time  = EXCLUDED.zoho_last_modified_time,
        zoho_synced_at           = EXCLUDED.zoho_synced_at,
        zoho_notes               = EXCLUDED.zoho_notes,
        unit_price               = EXCLUDED.unit_price,
        updated_at               = now();
    END IF;

    -- ── putaway facts (only when a bin is set) ──────────────────────────────
    IF NEW.location_code IS NOT NULL THEN
      INSERT INTO receiving_line_putaway (receiving_line_id, organization_id, location_code)
      VALUES (NEW.id, NEW.organization_id, NEW.location_code)
      ON CONFLICT (receiving_line_id) DO UPDATE SET
        location_code = EXCLUDED.location_code,
        updated_at    = now();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- dual-write is best-effort; never break the parent receiving write
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_receiving_line_facts ON receiving_line;
CREATE TRIGGER trg_sync_receiving_line_facts
  AFTER INSERT OR UPDATE OF
    needs_test, assigned_tech_id, qa_status, disposition_code, condition_grade,
    disposition_final, disposition_audit, condition_set_at,
    zoho_item_id, zoho_line_item_id,
    zoho_purchase_receive_id, zoho_purchaseorder_id, zoho_purchaseorder_number,
    zoho_purchaseorder_number_norm,
    zoho_sync_source, zoho_last_modified_time, zoho_synced_at, zoho_notes,
    unit_price, location_code
  ON receiving_line
  FOR EACH ROW EXECUTE FUNCTION fn_sync_receiving_line_facts();

-- Org-led lookup index for the mirror-join reads that move onto this column.
CREATE INDEX IF NOT EXISTS idx_receiving_line_zoho_po_number_norm
  ON receiving_line_zoho (organization_id, zoho_purchaseorder_number_norm);

COMMIT;
