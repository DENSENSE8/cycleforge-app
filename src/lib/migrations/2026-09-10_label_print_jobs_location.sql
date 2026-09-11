-- label_print_jobs — allow LOCATION job_type for warehouse bin/rack sticker
-- prints (print-run surface). Append-only ledger; no new FK (location identity
-- lives in qr_payload / template_id).
--
-- Safety: widens an existing CHECK only; existing rows remain valid.
-- Rollback: tighten CHECK back to UNIT|MANIFEST|HANDLING_UNIT|REPRINT after
-- deleting LOCATION rows (or leave them — constraint drop is reversible).
-- Verify: SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--         WHERE conname = 'label_print_jobs_job_type_chk';

BEGIN;

ALTER TABLE label_print_jobs
  DROP CONSTRAINT IF EXISTS label_print_jobs_job_type_chk;

ALTER TABLE label_print_jobs
  ADD CONSTRAINT label_print_jobs_job_type_chk
  CHECK (job_type IN ('UNIT', 'MANIFEST', 'HANDLING_UNIT', 'REPRINT', 'LOCATION'));

COMMIT;
