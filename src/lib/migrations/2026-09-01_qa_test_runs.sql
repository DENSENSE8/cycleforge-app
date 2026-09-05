-- 2026-09-01 — QA test-run ledger (filename retained; body is a no-op)
--
-- This file originally created a second `qa_test_runs` shape (`action` /
-- `scenario` / `metadata`). The live table was already born in
-- `2026-09-01_qa_console.sql` (`kind` / `run_id` / `result`), which is what
-- `src/lib/qa/test-run.ts` writes. CREATE TABLE IF NOT EXISTS would no-op,
-- then `CHECK (action IN …)` failed because `action` does not exist.
--
-- Keep the filename so `schema_migrations` can record it. Do not reshape
-- `qa_test_runs` here.
--
-- VERIFY: \d qa_test_runs — columns include kind, run_id, result (not action).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'qa_test_runs'
  ) THEN
    RAISE EXCEPTION 'qa_test_runs missing — apply 2026-09-01_qa_console.sql first';
  END IF;
END $$;

COMMIT;
