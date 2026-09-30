-- E2E receiving fixtures deliberately create real arrival scans, but the
-- scan-evidence guard subsequently prevented their carton cleanup and made the
-- UI report a 500 / INTERNAL. Permit an explicitly armed transaction to delete
-- ONLY clearly marked E2E scans; every operational evidence row stays immutable.

CREATE OR REPLACE FUNCTION public.guard_evidence_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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
