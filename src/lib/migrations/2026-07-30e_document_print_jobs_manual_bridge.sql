-- 2026-07-30e_document_print_jobs_manual_bridge.sql
-- JIT pack documents Phase 2 — allow printing product_manuals via the same
-- document_print_jobs ledger without migrating manuals into `documents` yet.
--
-- Changes:
--   - document_type gains 'manual'
--   - document_id becomes nullable (manuals are not documents rows)
--   - product_manual_id added for the bridge
--   - CHECK: outbound rows require document_id; manual rows require product_manual_id
--
-- ROLLBACK: reverse the CHECKs, drop product_manual_id, restore document_id NOT NULL
--           and document_type to shipping_label|packing_slip only (after deleting manual rows).

BEGIN;

ALTER TABLE document_print_jobs
  ALTER COLUMN document_id DROP NOT NULL;

ALTER TABLE document_print_jobs
  ADD COLUMN IF NOT EXISTS product_manual_id INTEGER;

ALTER TABLE document_print_jobs
  DROP CONSTRAINT IF EXISTS document_print_jobs_document_type_chk;

ALTER TABLE document_print_jobs
  ADD CONSTRAINT document_print_jobs_document_type_chk
  CHECK (document_type IN ('shipping_label', 'packing_slip', 'manual'));

ALTER TABLE document_print_jobs
  DROP CONSTRAINT IF EXISTS document_print_jobs_source_chk;

ALTER TABLE document_print_jobs
  ADD CONSTRAINT document_print_jobs_source_chk
  CHECK (
    (document_type IN ('shipping_label', 'packing_slip') AND document_id IS NOT NULL)
    OR (document_type = 'manual' AND product_manual_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_document_print_jobs_manual
  ON document_print_jobs (organization_id, product_manual_id, created_at DESC)
  WHERE product_manual_id IS NOT NULL;

COMMENT ON COLUMN document_print_jobs.product_manual_id IS
  'Phase 2 bridge — product_manuals.id when document_type=manual; retired once manuals migrate into documents (Phase 3).';

COMMIT;
