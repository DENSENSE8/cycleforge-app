-- A carton delete removes the carton and its arrival scans.
--
-- Why: the rail's Delete carton verb was answered 409 whenever the carton
-- had a non-fixture arrival scan, with a toast telling the operator to hide
-- the row instead. Deleting a carton means the whole record goes, scans
-- included. Testing cartons and mistaken scans are the cases this unblocks.
--
-- Safety: the exception is transaction-local. Only a session that sets
-- app.receiving_carton_delete = on may delete receiving_scans. Every other
-- table on this function stays append-only. The E2E fixture exception stays
-- so existing cleanup still matches a tracking number that starts with E2E-.
--
-- Rollback: restore the function body from
-- 2026-09-29_receiving_e2e_scan_cleanup.sql.

CREATE OR REPLACE FUNCTION public.guard_evidence_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'receiving_scans'
     AND TG_OP = 'DELETE'
     AND current_setting('app.receiving_carton_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'receiving_scans'
     AND TG_OP = 'DELETE'
     AND current_setting('app.receiving_e2e_cleanup', true) = 'on'
     AND OLD.tracking_number ILIKE 'E2E-%' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    '% is append-only evidence: % is refused. Append a correction event instead (master plan 2.2).',
    TG_TABLE_NAME,
    TG_OP;
END;
$$;
